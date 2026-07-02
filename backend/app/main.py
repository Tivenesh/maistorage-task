import logging
import json
import time
from collections.abc import Generator
from typing import Any

from fastapi import FastAPI, Depends, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker

from . import rag
from .config import cors_allow_origins
from .database import engine, Base, get_db
from .models import AgentConfig, AppSettings, ChatRun, ChatSession, ChatMessage, DocumentChunk, LLMProvider, Project, ProjectDocument, Workspace
from .orchestrator import OrchestrationContext, run_lightweight_orchestration
from .schemas import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    LLMProviderCreate,
    LLMProviderResponse,
    LLMProviderUpdate,
    SessionResponse,
    SessionDetailResponse,
    SessionCreate,
    ModelInfo,
    ProjectCreate,
    ProjectDocumentCreate,
    ProjectDocumentResponse,
    ProjectResponse,
    ChatRunResponse,
    HealthResponse,
    MetricsResponse,
    QualityReportResponse,
    SettingsResponse,
    SettingsUpdate,
    ChatRequest,
    SessionExportResponse,
    WorkspaceCreate,
    WorkspaceResponse,
)
from .llm import api_key as gemini_api_key
from .llm import DEFAULT_SYSTEM_INSTRUCTION, list_available_models, model_name, stream_chat_response

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Per-agent steering. These are appended to DEFAULT_SYSTEM_INSTRUCTION as part of
# the system prompt (not stuffed into the user message), so they actually shape
# behavior. Kept free of length caps like "be concise" — length is matched to the
# question by the base instruction instead.
AGENT_INSTRUCTIONS = {
    "general": (
        "Active agent: General. Be a well-rounded engineering assistant. Give a "
        "complete, well-organized answer and carry context forward across the session."
    ),
    "research": (
        "Active agent: Research. Structure the answer into clear sections. Separate "
        "established facts from assumptions, surface tradeoffs, and note the evidence "
        "or sources behind key claims (and where evidence is thin)."
    ),
    "code": (
        "Active agent: Code. Focus on concrete implementation: working code in fenced "
        "blocks, the reasoning behind design choices, failure modes, and how to verify "
        "the result. Call out edge cases and tests worth adding."
    ),
    "web": (
        "Active agent: Web. Prioritize the fresh external context in the web lookup "
        "snippets, attribute claims to those snippets, and state clearly when the "
        "lookup data is limited or missing."
    ),
}

WEB_LOOKUP_TIMEOUT_SECONDS = 4.0
MAX_ATTACHMENT_CHARS = 6000
MAX_PROJECT_CONTEXT_CHARS = 8000
MAX_PROJECT_DOCUMENT_CHARS = 120_000

# Context-window budget for what gets sent to the provider. The full history
# stays in the database; only the trimmed window travels to the LLM. This is a
# lightweight stand-in for summarize-and-compress history management
# (see Onyx's compress_chat_history) that stays cheap on a laptop.
MAX_HISTORY_MESSAGES = 30
MAX_HISTORY_CHARS = 24_000

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Tesseracq Labs AI R&D Chat API",
    description="Scalable streaming chat backend with session retention",
    version="1.0.0"
)

# CORS configuration: explicit localhost allowlist by default, overridable via
# CORS_ALLOW_ORIGINS. Browsers reject wildcard origins combined with
# credentials, so credentials are only enabled for explicit origins.
_cors_origins = cors_allow_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def sse_event(data: str, event: str | None = None) -> str:
    lines = []
    if event:
        lines.append(f"event: {event}")
    for data_line in data.splitlines() or [""]:
        lines.append(f"data: {data_line}")
    return "\n".join(lines) + "\n\n"

def sse_json_event(payload: dict[str, Any], event: str) -> str:
    return sse_event(json.dumps(payload, ensure_ascii=False), event=event)

def provider_response(provider: LLMProvider) -> LLMProviderResponse:
    key_preview = "not configured"
    if provider.api_key:
        key_preview = (
            f"{provider.api_key[:4]}...{provider.api_key[-4:]}"
            if len(provider.api_key) > 8
            else "configured"
        )

    return LLMProviderResponse(
        id=provider.id,
        provider=provider.provider,
        display_name=provider.display_name,
        api_key_configured=bool(provider.api_key),
        api_key_preview=key_preview,
        base_url=provider.base_url,
        default_model=provider.default_model,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )

def workspace_response(workspace: Workspace) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        file_tree=json.loads(workspace.file_tree),
        selected_files=json.loads(workspace.selected_files),
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )

def get_or_create_settings(db: Session) -> AppSettings:
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if settings:
        return settings

    settings = AppSettings(id=1)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings

def build_web_context(query: str) -> str:
    """
    Fetches lightweight public web context for demo web-search mode.
    Wikipedia OpenSearch keeps this dependency-free and reliable enough for an interview demo.
    """
    try:
        response = httpx.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "opensearch",
                "search": query,
                "limit": 3,
                "namespace": 0,
                "format": "json",
            },
            headers={
                "User-Agent": "TesseracqLabsMaistorageDemo/1.0 (interview demo; contact@example.com)"
            },
            timeout=WEB_LOOKUP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        titles = data[1] if len(data) > 1 else []
        descriptions = data[2] if len(data) > 2 else []
        urls = data[3] if len(data) > 3 else []

        results = []
        for index, title in enumerate(titles):
            description = descriptions[index] if index < len(descriptions) else ""
            url = urls[index] if index < len(urls) else ""
            results.append(f"- {title}: {description} {url}".strip())

        return "\n".join(results) if results else "No public web snippets were found."
    except Exception as exc:
        logger.warning("Web lookup failed: %s", exc)
        return "Web lookup was requested, but the live lookup was unavailable."

def rank_project_documents(documents: list[ProjectDocument], query: str, limit: int = 3) -> list[ProjectDocument]:
    query_terms = {term.lower() for term in query.replace("\n", " ").split() if len(term) > 2}
    if not query_terms:
        return documents[:limit]

    scored_documents: list[tuple[int, ProjectDocument]] = []
    for document in documents:
        text = f"{document.name}\n{document.content}".lower()
        score = sum(1 for term in query_terms if term in text)
        scored_documents.append((score, document))

    scored_documents.sort(key=lambda item: (item[0], item[1].created_at), reverse=True)
    return [document for score, document in scored_documents[:limit] if score > 0] or documents[:limit]

def _semantic_snippets(db: Session, project_id: str, query: str, documents: list[ProjectDocument]) -> list[str] | None:
    """Vector retrieval: top-k relevant chunks, cited by document name. None => fall back to keyword."""
    results = rag.semantic_search(db, project_id, query)
    if not results:
        return None

    document_names = {document.id: document.name for document in documents}
    remaining_chars = MAX_PROJECT_CONTEXT_CHARS
    snippets: list[str] = []
    for score, chunk in results:
        if remaining_chars <= 0:
            break
        name = document_names.get(chunk.document_id, "document")
        body = chunk.content[: min(remaining_chars, 2000)]
        remaining_chars -= len(body)
        snippets.append(f"[{name}] (relevance {score:.2f}):\n{body}")
    return snippets or None

def _keyword_snippets(documents: list[ProjectDocument], query: str) -> list[str]:
    """Keyword fallback: whole-document ranking by term overlap, cited by document name."""
    ranked_documents = rank_project_documents(documents, query)
    remaining_chars = MAX_PROJECT_CONTEXT_CHARS
    snippets: list[str] = []
    for document in ranked_documents:
        if remaining_chars <= 0:
            break
        snippet = document.content[: min(remaining_chars, 2500)]
        remaining_chars -= len(snippet)
        snippets.append(f"[{document.name}]:\n{snippet}")
    return snippets

def build_project_context(db: Session, project_id: str | None, query: str) -> str | None:
    if not project_id:
        return None

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None

    header = [
        f"Active project: {project.name}",
        f"Project description: {project.description or 'No description provided.'}",
    ]

    documents = (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at.desc())
        .all()
    )
    if not documents:
        return "\n".join(header)

    # Prefer semantic (vector) retrieval; degrade to keyword when embeddings are
    # unavailable so keyless/offline demos and tests still get grounded context.
    snippets = _semantic_snippets(db, project_id, query, documents)
    retrieval_mode = "semantic"
    if snippets is None:
        snippets = _keyword_snippets(documents, query)
        retrieval_mode = "keyword"
    if not snippets:
        return "\n".join(header)

    return "\n\n".join(
        header + [f"Project knowledge base ({retrieval_mode} retrieval):\n" + "\n\n".join(snippets)]
    )

def build_augmented_message(
    payload: ChatRequest,
    agent_instruction: str | None = None,
    project_context: str | None = None,
) -> str:
    """
    Builds the grounding block prepended to the user's latest message: web
    snippets, project knowledge, and attached files. Behavior steering (agent
    role, project-citation rules) lives in the system instruction instead — see
    build_system_instruction — so this function only carries per-turn *data*.
    """
    context_blocks: list[str] = []

    if payload.search_mode:
        context_blocks.append(
            "Search mode: the user expects a retrieval-style answer with clear bullets and explicit assumptions."
        )

    if payload.web_search:
        context_blocks.append(f"Web lookup snippets:\n{build_web_context(payload.message)}")

    if project_context:
        context_blocks.append(f"PROJECT KNOWLEDGE BASE (primary source of truth):\n{project_context}")

    attachment_blocks = []
    for attachment in payload.attachments:
        if not attachment.content:
            continue
        safe_content = attachment.content[:MAX_ATTACHMENT_CHARS]
        attachment_blocks.append(f"File: {attachment.name}\n{safe_content}")

    if attachment_blocks:
        context_blocks.append("Attached file context:\n" + "\n\n".join(attachment_blocks))

    if not context_blocks:
        return payload.message

    context = "\n\n".join(context_blocks)
    return f"{context}\n\nUser message:\n{payload.message}"

def build_system_instruction(
    agent_instruction: str | None,
    agent_id: str,
    has_project_context: bool,
) -> str:
    """
    Assembles the full system prompt: baseline behavior contract + the active
    agent's steering + an explicit reminder to use the project knowledge base
    when one is attached. This is what makes selecting a project visibly change
    the answer (the model is told to ground in and cite the docs).
    """
    agent_block = agent_instruction or AGENT_INSTRUCTIONS.get(agent_id, AGENT_INSTRUCTIONS["general"])
    blocks = [DEFAULT_SYSTEM_INSTRUCTION, agent_block]
    if has_project_context:
        blocks.append(
            "A project knowledge base is attached to this turn. Base your answer on it, "
            "cite the document names you use in square brackets, and explicitly note "
            "anything the user asked that those documents do not cover."
        )
    return "\n\n".join(blocks)

def trim_history_for_model(history: list[dict[str, str]]) -> list[dict[str, str]]:
    """
    Applies the provider context budget: keeps at most MAX_HISTORY_MESSAGES of
    the newest messages within MAX_HISTORY_CHARS. The latest (augmented) user
    message is always kept, even when it alone exceeds the budget. Full history
    remains untouched in the database.
    """
    if not history:
        return history

    window = history[-MAX_HISTORY_MESSAGES:]
    trimmed: list[dict[str, str]] = []
    remaining_chars = MAX_HISTORY_CHARS
    for message in reversed(window):
        cost = len(message["content"])
        if trimmed and cost > remaining_chars:
            break
        trimmed.append(message)
        remaining_chars -= cost
    return list(reversed(trimmed))

@app.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    """
    Creates a new chat session, optionally scoped to a project.
    """
    session = ChatSession(title=payload.title, project_id=payload.project_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"Created chat session: {session.id}")
    return session

@app.get("/sessions", response_model=list[SessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    """
    Lists all chat sessions, ordered by creation date descending.
    """
    sessions = db.query(ChatSession).order_by(ChatSession.created_at.desc()).all()
    return sessions

@app.get("/models", response_model=list[ModelInfo])
def get_models():
    return list_available_models()

@app.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    return HealthResponse(
        status="ok",
        database="connected",
        configured_model=model_name,
        gemini_api_configured=bool(gemini_api_key),
        sessions=db.query(ChatSession).count(),
        messages=db.query(ChatMessage).count(),
        runs=db.query(ChatRun).count(),
    )

@app.get("/metrics", response_model=MetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    completed_runs = db.query(ChatRun).filter(ChatRun.status == "completed").all()
    average_duration = (
        int(sum(run.duration_ms for run in completed_runs) / len(completed_runs))
        if completed_runs
        else 0
    )
    return MetricsResponse(
        sessions=db.query(ChatSession).count(),
        messages=db.query(ChatMessage).count(),
        projects=db.query(Project).count(),
        project_documents=db.query(ProjectDocument).count(),
        document_chunks=db.query(DocumentChunk).count(),
        workspaces=db.query(Workspace).count(),
        providers=db.query(LLMProvider).count(),
        runs_total=db.query(ChatRun).count(),
        runs_completed=len(completed_runs),
        runs_error=db.query(ChatRun).filter(ChatRun.status == "error").count(),
        average_duration_ms=average_duration,
    )

@app.get("/runs", response_model=list[ChatRunResponse])
def list_runs(limit: int = 25, db: Session = Depends(get_db)):
    bounded_limit = max(1, min(limit, 100))
    return db.query(ChatRun).order_by(ChatRun.created_at.desc()).limit(bounded_limit).all()

@app.get("/sessions/{session_id}/runs", response_model=list[ChatRunResponse])
def list_session_runs(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db.query(ChatRun).filter(ChatRun.session_id == session_id).order_by(ChatRun.created_at.desc()).all()

@app.get("/providers", response_model=list[LLMProviderResponse])
def list_providers(db: Session = Depends(get_db)):
    providers = db.query(LLMProvider).order_by(LLMProvider.created_at.desc()).all()
    return [provider_response(provider) for provider in providers]

@app.post("/providers", response_model=LLMProviderResponse, status_code=status.HTTP_201_CREATED)
def create_provider(payload: LLMProviderCreate, db: Session = Depends(get_db)):
    provider = LLMProvider(
        provider=payload.provider,
        display_name=payload.display_name,
        api_key=payload.api_key,
        base_url=payload.base_url,
        default_model=payload.default_model,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider_response(provider)

@app.put("/providers/{provider_id}", response_model=LLMProviderResponse)
def update_provider(provider_id: str, payload: LLMProviderUpdate, db: Session = Depends(get_db)):
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    for field in ["provider", "display_name", "api_key", "base_url", "default_model"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(provider, field, value)

    db.commit()
    db.refresh(provider)
    return provider_response(provider)

@app.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(provider)
    db.commit()
    return None

@app.get("/projects", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.created_at.desc()).all()

@app.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=payload.name, description=payload.description or "")
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@app.get("/projects/{project_id}/documents", response_model=list[ProjectDocumentResponse])
def list_project_documents(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at.desc())
        .all()
    )

@app.post(
    "/projects/{project_id}/documents",
    response_model=ProjectDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project_document(project_id: str, payload: ProjectDocumentCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    content = payload.content[:MAX_PROJECT_DOCUMENT_CHARS]
    document = ProjectDocument(project_id=project_id, name=payload.name, content=content)
    db.add(document)
    db.commit()
    db.refresh(document)

    # Index for semantic retrieval. Best-effort: a failed/absent embedding must
    # never fail the upload — retrieval simply falls back to keyword until the
    # document is (re)indexed.
    try:
        chunk_count = rag.index_document(db, document)
        if chunk_count:
            logger.info("Indexed %s chunks for document %s", chunk_count, document.id)
    except Exception as exc:
        logger.warning("Failed to index document %s: %s", document.id, exc)

    return document

@app.post("/projects/{project_id}/reindex")
def reindex_project_documents(project_id: str, db: Session = Depends(get_db)):
    """Rebuild the vector index for a project's documents (e.g. after enabling a key)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not rag.embeddings_available():
        return {"project_id": project_id, "indexed_chunks": 0, "status": "embeddings_unavailable"}
    indexed = rag.reindex_project(db, project_id)
    return {"project_id": project_id, "indexed_chunks": indexed, "status": "ok"}

@app.get("/agents", response_model=list[AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    return db.query(AgentConfig).order_by(AgentConfig.created_at.desc()).all()

@app.post("/agents", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    agent = AgentConfig(
        name=payload.name,
        description=payload.description or "",
        system_prompt=payload.system_prompt or "",
        provider_id=payload.provider_id,
        model=payload.model,
        project_id=payload.project_id,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent

@app.put("/agents/{agent_id}", response_model=AgentResponse)
def update_agent(agent_id: str, payload: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(AgentConfig).filter(AgentConfig.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    for field in ["name", "description", "system_prompt", "provider_id", "model", "project_id"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(agent, field, value)

    db.commit()
    db.refresh(agent)
    return agent

@app.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(AgentConfig).filter(AgentConfig.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()
    return None

@app.get("/settings", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    return SettingsResponse(
        theme=settings.theme,
        sidebar_collapsed=settings.sidebar_collapsed,
        default_model=settings.default_model,
    )

@app.put("/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    if payload.theme is not None:
        settings.theme = payload.theme
    if payload.sidebar_collapsed is not None:
        settings.sidebar_collapsed = payload.sidebar_collapsed
    if payload.default_model is not None:
        settings.default_model = payload.default_model

    db.commit()
    db.refresh(settings)
    return SettingsResponse(
        theme=settings.theme,
        sidebar_collapsed=settings.sidebar_collapsed,
        default_model=settings.default_model,
    )

@app.get("/workspaces", response_model=list[WorkspaceResponse])
def list_workspaces(db: Session = Depends(get_db)):
    workspaces = db.query(Workspace).order_by(Workspace.created_at.desc()).all()
    return [workspace_response(workspace) for workspace in workspaces]

@app.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    workspace = Workspace(
        name=payload.name,
        file_tree=json.dumps(payload.file_tree),
        selected_files=json.dumps([attachment.model_dump() for attachment in payload.selected_files]),
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace_response(workspace)

@app.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session(session_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a single session with all its messages.
    """
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.get("/sessions/{session_id}/export", response_model=SessionExportResponse)
def export_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    lines = [f"# {session.title}", "", f"Session ID: `{session.id}`", ""]
    for message in messages:
        label = "User" if message.role == "user" else "Assistant"
        lines.extend([f"## {label}", "", message.content, ""])

    return SessionExportResponse(
        session_id=session.id,
        title=session.title,
        markdown="\n".join(lines).strip() + "\n",
    )

@app.get("/sessions/{session_id}/export.md")
def export_session_markdown(session_id: str, db: Session = Depends(get_db)):
    exported = export_session(session_id, db)
    return Response(
        content=exported.markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.md"'},
    )

@app.get("/sessions/{session_id}/quality-report", response_model=QualityReportResponse)
def session_quality_report(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    assistant_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id, ChatMessage.role == "assistant")
        .order_by(ChatMessage.created_at.desc())
        .all()
    )
    latest_answer = assistant_messages[0].content if assistant_messages else ""
    checks = {
        "has_visible_thought_summary": "[THOUGHT]" in latest_answer or "[PLANNER]" in latest_answer,
        "has_final_answer": "[ANSWER]" in latest_answer or bool(latest_answer.strip()),
        "has_review_step": "[REVIEWER]" in latest_answer,
        "has_project_context": bool(session.project_id),
        "message_count": db.query(ChatMessage).filter(ChatMessage.session_id == session_id).count(),
        "run_count": db.query(ChatRun).filter(ChatRun.session_id == session_id).count(),
    }
    boolean_score = sum(1 for key in ["has_visible_thought_summary", "has_final_answer", "has_review_step"] if checks[key])
    score = int((boolean_score / 3) * 100)
    recommendations = []
    if not checks["has_visible_thought_summary"]:
        recommendations.append("Enable Orchestrate mode or use the structured fallback so the answer shows an approach section.")
    if not checks["has_review_step"]:
        recommendations.append("Include a reviewer/quality check section for stronger assessment presentation.")
    if not checks["has_project_context"]:
        recommendations.append("Select a project and upload documents to demonstrate project-scoped RAG.")

    return QualityReportResponse(
        session_id=session_id,
        status="pass" if score >= 67 else "needs_attention",
        checks=checks,
        score=score,
        recommendations=recommendations,
    )

@app.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, db: Session = Depends(get_db)):
    """
    Deletes a session and all its messages.
    """
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    logger.info(f"Deleted chat session: {session_id}")
    return None

@app.post("/sessions/{session_id}/stream")
def stream_chat(session_id: str, payload: ChatRequest, db: Session = Depends(get_db)):
    """
    Handles user prompts, saves user message, and streams assistant response token-by-token via SSE.
    """
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Save user message to database
    user_msg = ChatMessage(session_id=session_id, role="user", content=payload.message)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)
    
    # Retrieve complete message history for context
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    history = [{"role": msg.role, "content": msg.content} for msg in messages]
    selected_model = payload.model
    selected_provider: LLMProvider | None = None
    agent_instruction = None
    # A chat created inside a project inherits that project's knowledge, matching
    # how Projects work elsewhere: the composer's explicit selection wins, but
    # otherwise the session's own project drives context instead of dropping it.
    project_id = payload.project_id or session.project_id

    if payload.agent_id not in AGENT_INSTRUCTIONS:
        agent = db.query(AgentConfig).filter(AgentConfig.id == payload.agent_id).first()
        if agent:
            selected_model = selected_model or agent.model
            selected_provider = agent.provider
            agent_instruction = f"{agent.name}: {agent.system_prompt or agent.description}"
            project_id = project_id or agent.project_id

    if payload.provider_id:
        selected_provider = db.query(LLMProvider).filter(LLMProvider.id == payload.provider_id).first()

    project_context = build_project_context(db, project_id, payload.message)

    if history:
        history[-1] = {
            **history[-1],
            "content": build_augmented_message(
                payload,
                agent_instruction=agent_instruction,
                project_context=project_context,
            ),
        }

    model_history = trim_history_for_model(history)
    system_instruction = build_system_instruction(
        agent_instruction,
        payload.agent_id,
        has_project_context=bool(project_context),
    )

    # Auto-update default title if this is the first user message
    if len(messages) <= 2 and session.title == "New Conversation":
        new_title = payload.message[:30] + ("..." if len(payload.message) > 30 else "")
        session.title = new_title
        db.commit()
        logger.info(f"Updated session title to: '{new_title}'")

    run = ChatRun(
        session_id=session_id,
        model=selected_model or model_name,
        provider=selected_provider.provider if selected_provider else "gemini",
        project_id=project_id,
        orchestrated=payload.orchestrate,
        prompt_chars=sum(len(message["content"]) for message in model_history),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    def event_generator() -> Generator[str, None, None]:
        accumulated_text = ""
        started_at = time.perf_counter()
        try:
            yield sse_json_event(
                {
                    "run_id": run.id,
                    "user_message_id": user_msg.id,
                    "session_id": session_id,
                    "session_title": session.title,
                    "model": selected_model or model_name,
                },
                event="metadata",
            )
            
            # Stream from Gemini API
            provider_config = None
            if selected_provider:
                provider_config = {
                    "provider": selected_provider.provider,
                    "api_key": selected_provider.api_key,
                    "base_url": selected_provider.base_url,
                    "default_model": selected_provider.default_model,
                }

            for chunk in stream_chat_response(
                model_history,
                selected_model=selected_model,
                provider_config=provider_config,
                system_instruction=system_instruction,
            ) if not payload.orchestrate else run_lightweight_orchestration(
                OrchestrationContext(
                    user_message=payload.message,
                    project_context=project_context,
                    attachments=payload.attachments,
                    history=model_history,
                    selected_model=selected_model,
                    provider_config=provider_config,
                    system_instruction=system_instruction,
                ),
                stream_chat_response,
            ):
                accumulated_text += chunk
                yield sse_event(chunk, event="token")
            
            # On completion, save assistant response to DB using a dedicated session bound to the same engine
            db_save = sessionmaker(bind=db.get_bind())()
            try:
                assistant_msg = ChatMessage(session_id=session_id, role="assistant", content=accumulated_text)
                db_save.add(assistant_msg)
                saved_run = db_save.query(ChatRun).filter(ChatRun.id == run.id).first()
                if saved_run:
                    saved_run.status = "completed"
                    saved_run.response_chars = len(accumulated_text)
                    saved_run.duration_ms = int((time.perf_counter() - started_at) * 1000)
                db_save.commit()
                logger.info(f"Saved LLM assistant response for session: {session_id}")
            except Exception as save_err:
                logger.error(f"Failed to save assistant response: {str(save_err)}")
                db_save.rollback()
            finally:
                db_save.close()
            
            yield sse_event("[DONE]", event="end")
        except Exception as e:
            logger.error(f"Error in streaming event generator: {str(e)}")
            db_error = sessionmaker(bind=db.get_bind())()
            try:
                failed_run = db_error.query(ChatRun).filter(ChatRun.id == run.id).first()
                if failed_run:
                    failed_run.status = "error"
                    failed_run.response_chars = len(accumulated_text)
                    failed_run.duration_ms = int((time.perf_counter() - started_at) * 1000)
                    failed_run.error = str(e)[:2000]
                db_error.commit()
            finally:
                db_error.close()
            yield sse_json_event({"detail": str(e)}, event="error")
        finally:
            db_final = sessionmaker(bind=db.get_bind())()
            try:
                final_run = db_final.query(ChatRun).filter(ChatRun.id == run.id).first()
                if final_run and final_run.status == "running":
                    final_run.status = "cancelled"
                    final_run.response_chars = len(accumulated_text)
                    final_run.duration_ms = int((time.perf_counter() - started_at) * 1000)
                    db_final.commit()
            finally:
                db_final.close()
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
