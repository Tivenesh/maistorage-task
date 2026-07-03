import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# Create in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override database dependency
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_database():
    # Create tables
    Base.metadata.create_all(bind=engine)
    yield
    # Drop tables
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(autouse=True)
def disable_live_embeddings(monkeypatch):
    # This machine has a real Gemini key, so semantic retrieval would hit the
    # network. Default every test to the offline keyword path for isolation; the
    # dedicated RAG test re-enables embeddings with a deterministic local fake.
    from app import rag
    monkeypatch.setattr(rag, "embed_texts", lambda texts, task_type="RETRIEVAL_DOCUMENT": None)
    yield

client = TestClient(app)

def test_create_and_list_sessions():
    # 1. Create session
    response = client.post("/sessions", json={"title": "Test Chat"})
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Chat"
    assert "id" in data
    session_id = data["id"]

    # 2. List sessions
    response = client.get("/sessions")
    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) == 1
    assert sessions[0]["id"] == session_id
    assert sessions[0]["title"] == "Test Chat"

def test_get_session_details():
    # Create session
    res_create = client.post("/sessions", json={"title": "Test Details"})
    session_id = res_create.json()["id"]

    # Get session details (should have 0 messages initially)
    response = client.get(f"/sessions/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert data["messages"] == []

def test_list_models_returns_available_choices(monkeypatch):
    from app import main

    monkeypatch.setattr(
        main,
        "list_available_models",
        lambda: [{"id": "gemini-test-model", "label": "Gemini Test Model"}],
    )

    response = client.get("/models")
    assert response.status_code == 200
    assert response.json() == [{"id": "gemini-test-model", "label": "Gemini Test Model"}]

def test_default_model_is_consistent_with_fallback_list():
    from app.llm import FALLBACK_MODELS, model_name

    # model_name is env-driven (GEMINI_MODEL); assert internal consistency
    # instead of a literal so custom .env values do not break the suite.
    assert model_name
    assert FALLBACK_MODELS[0]["id"] == model_name

def test_env_loader_reads_files_without_overriding_existing(tmp_path, monkeypatch):
    from app.config import load_env_files

    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment line\n"
        "\n"
        "FAKE_TEST_KEY=from-file\n"
        "FAKE_EXISTING_KEY=should-not-win\n"
        "FAKE_EMPTY_KEY=\n"
        'FAKE_QUOTED_KEY="quoted value"\n',
        encoding="utf-8",
    )
    monkeypatch.delenv("FAKE_TEST_KEY", raising=False)
    monkeypatch.setenv("FAKE_EXISTING_KEY", "real-env-wins")
    monkeypatch.delenv("FAKE_EMPTY_KEY", raising=False)
    monkeypatch.delenv("FAKE_QUOTED_KEY", raising=False)

    loaded = load_env_files([env_file])

    assert loaded == [str(env_file)]
    import os
    assert os.environ["FAKE_TEST_KEY"] == "from-file"
    assert os.environ["FAKE_EXISTING_KEY"] == "real-env-wins"
    assert "FAKE_EMPTY_KEY" not in os.environ
    assert os.environ["FAKE_QUOTED_KEY"] == "quoted value"

def test_provider_agent_project_settings_and_workspace_lifecycle():
    provider_response = client.post(
        "/providers",
        json={
            "provider": "openai",
            "display_name": "OpenAI Demo",
            "api_key": "sk-test-secret",
            "default_model": "gpt-4o-mini",
        },
    )
    assert provider_response.status_code == 201
    provider = provider_response.json()
    assert provider["api_key_configured"] is True
    assert "sk-test-secret" not in provider_response.text

    project_response = client.post(
        "/projects",
        json={"name": "Interview Workspace", "description": "MaiStorage task"},
    )
    assert project_response.status_code == 201
    project = project_response.json()

    document_response = client.post(
        f"/projects/{project['id']}/documents",
        json={"name": "architecture.md", "content": "FastAPI streams tokens with project context."},
    )
    assert document_response.status_code == 201
    assert document_response.json()["project_id"] == project["id"]
    documents_response = client.get(f"/projects/{project['id']}/documents")
    assert documents_response.status_code == 200
    assert documents_response.json()[0]["name"] == "architecture.md"

    agent_response = client.post(
        "/agents",
        json={
            "name": "R&D Agent",
            "description": "Systems focused assistant",
            "system_prompt": "Answer like a pragmatic R&D engineer.",
            "provider_id": provider["id"],
            "model": "gpt-4o-mini",
            "project_id": project["id"],
        },
    )
    assert agent_response.status_code == 201
    agent = agent_response.json()
    assert agent["provider_id"] == provider["id"]
    assert agent["project_id"] == project["id"]

    settings_response = client.put(
        "/settings",
        json={"theme": "dark", "sidebar_collapsed": True, "default_model": "gpt-4o-mini"},
    )
    assert settings_response.status_code == 200
    assert settings_response.json()["sidebar_collapsed"] is True

    workspace_response = client.post(
        "/workspaces",
        json={
            "name": "Selected Folder",
            "file_tree": [{"path": "README.md", "type": "file"}],
            "selected_files": [{"name": "README.md", "content": "hello"}],
        },
    )
    assert workspace_response.status_code == 201
    assert workspace_response.json()["selected_files"][0]["content"] == "hello"

def test_delete_session():
    # Create session
    res_create = client.post("/sessions", json={"title": "To Delete"})
    session_id = res_create.json()["id"]

    # Delete session
    response = client.delete(f"/sessions/{session_id}")
    assert response.status_code == 204

    # Verify deleted
    response = client.get(f"/sessions/{session_id}")
    assert response.status_code == 404

def test_streaming_endpoint_and_db_persistence():
    # Create session
    res_create = client.post("/sessions", json={"title": "New Conversation"})
    session_id = res_create.json()["id"]

    # Call streaming endpoint
    # Note: TestClient.post with stream=True works for testing SSE
    with client.stream("POST", f"/sessions/{session_id}/stream", json={"message": "hello, call me Tiven"}) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        
        # Read lines from stream
        lines = [line if isinstance(line, str) else line.decode("utf-8") for line in response.iter_lines()]
        
        # Verify metadata event
        assert any("event: metadata" in line for line in lines)
        
        # Verify tokens exist
        tokens = [line for line in lines if line.startswith("data:")]
        assert len(tokens) > 0
        
        # Verify end event
        assert any("event: run" in line for line in lines)
        assert any("event: end" in line for line in lines)
        assert any("[DONE]" in line for line in lines)

    # Verify messages are successfully written to database
    # 1. User message must be in DB
    # 2. Assistant response must be in DB (as the stream finished successfully)
    response_details = client.get(f"/sessions/{session_id}")
    assert response_details.status_code == 200
    messages = response_details.json()["messages"]
    
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "hello, call me Tiven"
    
    assert messages[1]["role"] == "assistant"
    # Content shouldn't be empty
    assert len(messages[1]["content"]) > 0

    runs_response = client.get(f"/sessions/{session_id}/runs")
    assert runs_response.status_code == 200
    runs = runs_response.json()
    assert len(runs) == 1
    assert runs[0]["status"] == "completed"
    assert runs[0]["response_chars"] > 0
    assert runs[0]["duration_ms"] >= 0

def test_multi_turn_memory_uses_previous_session_messages():
    res_create = client.post("/sessions", json={"title": "New Conversation"})
    session_id = res_create.json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={"message": "Hi, call me Tiven"},
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={"message": "What is my name?"},
    ) as response:
        assert response.status_code == 200
        lines = [
            line if isinstance(line, str) else line.decode("utf-8")
            for line in response.iter_lines()
        ]

    streamed_text = " ".join(
        line.removeprefix("data: ")
        for line in lines
        if line.startswith("data: ") and "[DONE]" not in line
    )
    assert "Tiven" in streamed_text

    response_details = client.get(f"/sessions/{session_id}")
    messages = response_details.json()["messages"]
    assert [message["role"] for message in messages] == [
        "user",
        "assistant",
        "user",
        "assistant",
    ]

def test_failed_stream_does_not_persist_assistant_message(monkeypatch):
    from app import main

    def failing_stream(_history, selected_model=None, provider_config=None, system_instruction=None):
        yield "partial response"
        raise RuntimeError("provider disconnected")

    monkeypatch.setattr(main, "stream_chat_response", failing_stream)

    res_create = client.post("/sessions", json={"title": "Failure Test"})
    session_id = res_create.json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={"message": "please fail after one token"},
    ) as response:
        assert response.status_code == 200
        lines = [
            line if isinstance(line, str) else line.decode("utf-8")
            for line in response.iter_lines()
        ]

    assert any("event: error" in line for line in lines)

    response_details = client.get(f"/sessions/{session_id}")
    messages = response_details.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "user"

    runs = client.get(f"/sessions/{session_id}/runs").json()
    assert len(runs) == 1
    assert runs[0]["status"] == "error"
    assert "provider disconnected" in runs[0]["error"]

def test_stream_payload_augments_model_history_without_polluting_chat(monkeypatch):
    from app import main

    captured_history = []
    captured = {}

    def fake_web_context(_query):
        return "- Test result: verified web context"

    def fake_stream(history, selected_model=None, provider_config=None, system_instruction=None):
        captured_history.extend(history)
        captured["system_instruction"] = system_instruction
        assert selected_model == "gemini-test-model"
        yield "payload received"

    monkeypatch.setattr(main, "build_web_context", fake_web_context)
    monkeypatch.setattr(main, "stream_chat_response", fake_stream)

    res_create = client.post("/sessions", json={"title": "New Conversation"})
    session_id = res_create.json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={
            "message": "summarize this",
            "agent_id": "research",
            "model": "gemini-test-model",
            "search_mode": True,
            "web_search": True,
            "attachments": [{"name": "notes.txt", "content": "important interview notes"}],
        },
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    assert captured_history
    model_prompt = captured_history[-1]["content"]
    # Per-turn grounding data lives in the message...
    assert "Search mode" in model_prompt
    assert "Test result" in model_prompt
    assert "notes.txt" in model_prompt
    assert "important interview notes" in model_prompt
    assert "summarize this" in model_prompt
    # ...while behavior steering (agent role) now lives in the system instruction.
    system_instruction = captured["system_instruction"] or ""
    assert "Active agent: Research" in system_instruction
    assert "Tesseracq Labs R&D assistant" in system_instruction

    response_details = client.get(f"/sessions/{session_id}")
    messages = response_details.json()["messages"]
    assert messages[0]["content"] == "summarize this"

def test_stream_payload_includes_only_selected_project_documents(monkeypatch):
    from app import main

    captured_history = []
    captured = {}

    def fake_stream(history, selected_model=None, provider_config=None, system_instruction=None):
        captured_history.extend(history)
        captured["system_instruction"] = system_instruction
        yield "project context received"

    monkeypatch.setattr(main, "stream_chat_response", fake_stream)

    project_a = client.post(
        "/projects",
        json={"name": "Project A", "description": "Selected project"},
    ).json()
    project_b = client.post(
        "/projects",
        json={"name": "Project B", "description": "Other project"},
    ).json()
    client.post(
        f"/projects/{project_a['id']}/documents",
        json={"name": "selected.md", "content": "maistorage streaming endpoint details"},
    )
    client.post(
        f"/projects/{project_b['id']}/documents",
        json={"name": "other.md", "content": "cross project secret should not appear"},
    )

    session_id = client.post("/sessions", json={"title": "Project Context"}).json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={
            "message": "How does maistorage streaming work?",
            "project_id": project_a["id"],
        },
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    model_prompt = captured_history[-1]["content"]
    assert "Project A" in model_prompt
    assert "selected.md" in model_prompt
    assert "maistorage streaming endpoint details" in model_prompt
    assert "Project B" not in model_prompt
    assert "cross project secret" not in model_prompt

    # Selecting a project must also flip the system prompt into grounding mode,
    # which is what makes the answer visibly different from a no-project chat.
    system_instruction = captured["system_instruction"] or ""
    assert "project knowledge base" in system_instruction.lower()
    assert "square brackets" in system_instruction

def test_session_inherits_project_binding_without_payload_project(monkeypatch):
    from app import main

    captured = {}

    def fake_stream(history, selected_model=None, provider_config=None, system_instruction=None):
        captured["prompt"] = history[-1]["content"]
        captured["system_instruction"] = system_instruction
        yield "ok"

    monkeypatch.setattr(main, "stream_chat_response", fake_stream)

    project = client.post("/projects", json={"name": "BoundProject", "description": "x"}).json()
    client.post(
        f"/projects/{project['id']}/documents",
        json={"name": "bound.md", "content": "inherited project knowledge marker"},
    )
    # Session is created INSIDE the project...
    session_id = client.post(
        "/sessions", json={"title": "bound", "project_id": project["id"]}
    ).json()["id"]

    # ...and the message is sent WITHOUT re-selecting the project in the payload.
    with client.stream(
        "POST", f"/sessions/{session_id}/stream", json={"message": "what do you know?"}
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    prompt = captured["prompt"]
    assert "BoundProject" in prompt
    assert "bound.md" in prompt
    assert "inherited project knowledge marker" in prompt
    assert "project knowledge base is attached" in (captured["system_instruction"] or "").lower()

def test_semantic_retrieval_ranks_relevant_chunk_first(monkeypatch):
    from app import main, rag

    # Deterministic bag-of-words embedding so cosine ranking is testable offline.
    vocabulary = ["deploy", "docker", "container", "cache", "token", "zebra", "fitness", "gym"]

    def fake_embed(texts, task_type="RETRIEVAL_DOCUMENT"):
        return [[float(text.lower().count(word)) for word in vocabulary] for text in texts]

    monkeypatch.setattr(rag, "embed_texts", fake_embed)

    captured = {}

    def fake_stream(history, selected_model=None, provider_config=None, system_instruction=None):
        captured["prompt"] = history[-1]["content"]
        yield "ok"

    monkeypatch.setattr(main, "stream_chat_response", fake_stream)

    project = client.post("/projects", json={"name": "RAGProject", "description": "x"}).json()
    client.post(
        f"/projects/{project['id']}/documents",
        json={"name": "deploy.md", "content": "To deploy the docker container use the zebra token."},
    )
    client.post(
        f"/projects/{project['id']}/documents",
        json={"name": "gym.md", "content": "The fitness gym membership renews every month."},
    )
    session_id = client.post("/sessions", json={"title": "rag"}).json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={"message": "how do I deploy the container?", "project_id": project["id"]},
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    prompt = captured["prompt"]
    assert "semantic retrieval" in prompt          # vector path used, not keyword fallback
    assert "deploy.md" in prompt                    # relevant chunk retrieved and cited by name
    assert "zebra token" in prompt                  # its content is present for grounding
    # The relevant document must outrank the irrelevant one.
    assert prompt.index("deploy.md") < prompt.index("gym.md")

def test_project_retrieval_falls_back_to_keyword_without_embeddings(monkeypatch):
    from app import main

    captured = {}

    def fake_stream(history, selected_model=None, provider_config=None, system_instruction=None):
        captured["prompt"] = history[-1]["content"]
        yield "ok"

    monkeypatch.setattr(main, "stream_chat_response", fake_stream)

    # embeddings are disabled by the autouse fixture -> keyword retrieval path
    project = client.post("/projects", json={"name": "KeywordProject", "description": "x"}).json()
    client.post(
        f"/projects/{project['id']}/documents",
        json={"name": "note.md", "content": "the streaming endpoint uses server sent events"},
    )
    session_id = client.post("/sessions", json={"title": "kw"}).json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={"message": "how does streaming work?", "project_id": project["id"]},
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    prompt = captured["prompt"]
    assert "keyword retrieval" in prompt
    assert "note.md" in prompt
    assert "server sent events" in prompt

def test_orchestrated_stream_emits_agent_stages_and_persists(monkeypatch):
    from app import main

    captured_history = []

    def fake_stream(history, selected_model=None, provider_config=None, system_instruction=None):
        captured_history.extend(history)
        yield "Coder output from selected context."

    monkeypatch.setattr(main, "stream_chat_response", fake_stream)

    project = client.post(
        "/projects",
        json={"name": "Orchestrated Project", "description": "Multi-agent demo"},
    ).json()
    client.post(
        f"/projects/{project['id']}/documents",
        json={"name": "rag.md", "content": "orchestration should use this scoped RAG note"},
    )
    session_id = client.post("/sessions", json={"title": "Orchestrator"}).json()["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={
            "message": "Build a tested architecture answer about orchestration",
            "project_id": project["id"],
            "orchestrate": True,
            "attachments": [{"name": "workspace.ts", "content": "export const mode = 'agentic';"}],
        },
    ) as response:
        assert response.status_code == 200
        lines = [
            line if isinstance(line, str) else line.decode("utf-8")
            for line in response.iter_lines()
        ]

    streamed_text = "\n".join(lines)
    assert "[PLANNER]" in streamed_text
    assert "[RESEARCH/RAG]" in streamed_text
    assert "[CODER]" in streamed_text
    assert "Coder output from selected context." in streamed_text
    assert "[REVIEWER]" in streamed_text
    assert "orchestration should use this scoped RAG note" in streamed_text
    assert "workspace.ts" in streamed_text

    assert captured_history
    coder_prompt = captured_history[-1]["content"]
    assert "Coder Agent" in coder_prompt
    assert "Orchestrated Project" in coder_prompt

    response_details = client.get(f"/sessions/{session_id}")
    messages = response_details.json()["messages"]
    assert len(messages) == 2
    assert messages[1]["role"] == "assistant"
    assert "[REVIEWER]" in messages[1]["content"]

def test_local_fallback_returns_structured_answer_not_placeholder():
    from app.llm import _mock_stream_response

    chunks = list(
        _mock_stream_response(
            [
                {
                    "role": "user",
                    "content": "Agent mode: General assistant\n\nUser message:\nhelp me research menstrual cycle",
                }
            ]
        )
    )
    response_text = "".join(chunks)

    assert "[THOUGHT]" in response_text
    assert "[ANSWER]" in response_text
    assert "[REVIEWER]" in response_text
    assert "menstrual cycle" in response_text
    assert "processed your query" not in response_text

def test_gemini_failover_tries_lighter_model(monkeypatch):
    from app import llm

    attempted_models = []

    def fake_stream(_history, model, _gemini_key=None, _system_instruction=None):
        attempted_models.append(model)
        if model == "models/gemini-3.1-pro-preview":
            raise RuntimeError("quota exhausted")
        yield "flash model response"

    monkeypatch.setattr(llm, "_stream_gemini_model", fake_stream)

    chunks = list(
        llm.stream_chat_response(
            [{"role": "user", "content": "hello"}],
            selected_model="models/gemini-3.1-pro-preview",
            provider_config={"api_key": "test-key"},
        )
    )

    assert "".join(chunks) == "flash model response"
    assert attempted_models[:2] == [
        "models/gemini-3.1-pro-preview",
        "models/gemini-3.1-flash-lite",
    ]

def test_stream_rejects_blank_and_oversized_messages():
    session_id = client.post("/sessions", json={"title": "Validation"}).json()["id"]

    blank = client.post(f"/sessions/{session_id}/stream", json={"message": "   "})
    assert blank.status_code == 422

    oversized = client.post(
        f"/sessions/{session_id}/stream", json={"message": "x" * 40_000}
    )
    assert oversized.status_code == 422

    # Nothing should have been persisted for rejected payloads
    messages = client.get(f"/sessions/{session_id}").json()["messages"]
    assert messages == []

def test_trim_history_keeps_newest_messages_within_budget():
    from app.main import MAX_HISTORY_MESSAGES, trim_history_for_model

    long_history = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"message {i} " + "x" * 900}
        for i in range(80)
    ]
    trimmed = trim_history_for_model(long_history)

    assert len(trimmed) <= MAX_HISTORY_MESSAGES
    # The newest (to-be-answered) message always survives trimming
    assert trimmed[-1] == long_history[-1]
    # Order is preserved and messages form a suffix of the original history
    assert trimmed == long_history[-len(trimmed):]

    # A single message larger than the whole budget is still sent
    huge = [{"role": "user", "content": "y" * 100_000}]
    assert trim_history_for_model(huge) == huge

def test_build_system_instruction_composes_base_agent_and_project_grounding():
    from app.main import build_system_instruction

    # Baseline behavior contract + agent steering, no project selected.
    base = build_system_instruction(None, "code", has_project_context=False)
    assert "Tesseracq Labs R&D assistant" in base
    assert "Active agent: Code" in base
    assert "project knowledge base is attached" not in base.lower()

    # Selecting a project appends an explicit grounding + citation directive.
    grounded = build_system_instruction(None, "general", has_project_context=True)
    assert "project knowledge base is attached" in grounded.lower()
    assert "square brackets" in grounded

    # A custom (DB-configured) agent instruction overrides the preset agent block.
    custom = build_system_instruction("Reply only in haiku.", "general", has_project_context=False)
    assert "Reply only in haiku." in custom

def test_raw_filesystem_endpoints_are_removed():
    # These endpoints allowed arbitrary local file read/write and were removed
    # deliberately; this test documents that security decision.
    assert client.post("/workspace/scan", json={"root_path": "C:/"}).status_code == 404
    assert client.post("/workspace/file", json={"path": "C:/secret.txt"}).status_code == 404
    assert client.post("/workspace/save", json={"path": "C:/x.txt", "content": "x"}).status_code == 404

def test_health_metrics_export_and_quality_report():
    session = client.post("/sessions", json={"title": "Operational Demo"}).json()
    session_id = session["id"]

    with client.stream(
        "POST",
        f"/sessions/{session_id}/stream",
        json={"message": "help me research menstrual cycle", "orchestrate": True},
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["runs"] == 1

    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["runs_completed"] == 1
    assert metrics.json()["messages"] == 2
    assert "document_chunks" in metrics.json()

    export_response = client.get(f"/sessions/{session_id}/export")
    assert export_response.status_code == 200
    assert "# Operational Demo" in export_response.json()["markdown"]
    assert "## User" in export_response.json()["markdown"]
    assert "## Assistant" in export_response.json()["markdown"]

    markdown_response = client.get(f"/sessions/{session_id}/export.md")
    assert markdown_response.status_code == 200
    assert markdown_response.headers["content-type"].startswith("text/markdown")

    report = client.get(f"/sessions/{session_id}/quality-report")
    assert report.status_code == 200
    report_data = report.json()
    assert report_data["score"] >= 67
    assert report_data["checks"]["has_visible_thought_summary"] is True
    assert report_data["checks"]["has_review_step"] is True
