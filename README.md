# Maistorage AI R&D Chat Task

This project is a compact FastAPI + Next.js implementation for Question 2 of the Maistorage interview task. The UI is branded as Tesseracq Labs as a personal portfolio wrapper, while the technical deliverable focuses on token streaming, chat-session memory, database persistence, testing, and Docker deployment.

## What It Builds

- One FastAPI REST streaming endpoint: `POST /sessions/{session_id}/stream`
- Token-by-token Server-Sent Events (SSE) streaming to the browser
- SQLite-backed chat sessions and message history
- Multi-turn context passed back into the LLM provider
- Projects with semantic RAG: documents are chunked, embedded (Gemini), and retrieved by vector similarity to ground and cite answers — with automatic keyword fallback when no key is present
- Next.js chat interface with session creation, deletion, history loading, and preset prompts
- Docker Compose deployment for backend and frontend
- Request validation, CORS allowlisting, and a provider context-window budget
- 23 automated backend tests covering session CRUD, streaming persistence, multi-turn memory, failure rollback, failover, system-prompt/project grounding, semantic vs keyword retrieval, and security regressions

## Architecture

```text
Next.js client
  |  REST session APIs
  |  SSE token stream
  v
FastAPI backend
  |  SQLAlchemy ORM
  v
SQLite database
  |
  v
Gemini API when configured, mock streaming fallback otherwise
```

## Key Implementation Decisions

1. SSE over WebSocket: the app only needs one-way assistant token streaming, so SSE keeps the protocol simple and easy to test. The stream uses typed events (`metadata`, `token`, `end`, `error`) so the client can distinguish framing from content.
2. Database-backed memory: every completed user/assistant exchange is saved and later sent back as LLM context for the same session.
3. Context-window budget: the full history lives in SQLite, but only a sliding window (newest 30 messages within a 24k-char budget) is sent to the provider, so long sessions cannot blow the model context or the bill. In production this would evolve into summarize-and-compress history management (the pattern Onyx uses in `compress_chat_history`); the sliding window is the laptop-friendly version of the same idea.
4. Safe stream persistence: the assistant message is committed only after the provider stream completes. If the provider fails mid-stream, the partial assistant output is not stored, and the run row records `error` status with the failure reason. Client disconnects mark the run `cancelled`.
5. Provider failover with an honest floor: Gemini requests fail over through lighter models; if every provider fails (or no key is configured), a deterministic offline fallback answers. The fallback openly labels itself, demonstrates the DB-backed memory (for example name recall), and explains how to enable live responses — it never pretends to be a real model.
6. System-prompt-driven answer quality: behavior steering lives in a real system instruction (`DEFAULT_SYSTEM_INSTRUCTION` in `llm.py`), applied via each provider's native mechanism — Gemini's `system_instruction` config, an OpenAI leading system message, or Anthropic's top-level `system` field. This is the main lever for response quality; per-turn *data* (project docs, attachments, web snippets) stays in the message while *steering* (agent role, formatting, honesty rules) stays in the system prompt. The four agent presets (General/Research/Code/Web) are composed into that system prompt rather than stuffed into the user's text.
7. Project grounding that visibly changes the answer: when a session has a project selected, its documents are retrieved, injected under a `PROJECT KNOWLEDGE BASE` header, and the system prompt instructs the model to ground its answer in them and cite document names in `[brackets]`. Selecting a project with docs produces a demonstrably different, cited answer versus the same question with no project — verified live and covered by tests. Two supporting decisions:
   - **Semantic retrieval without heavy infrastructure** (`rag.py`): documents are chunked (~1k chars, 150 overlap), embedded with Gemini `gemini-embedding-001` (reduced to 768 dims), and stored as JSON vectors in the *existing* SQLite database — no separate vector service and no local embedding model (no PyTorch), so it stays laptop- and Docker-safe. Retrieval embeds the query, ranks chunks by cosine similarity, and returns the top-k for grounding. If no key is configured or an embedding call fails, it transparently falls back to keyword ranking, so keyless/offline demos and tests still work. Documents are indexed on upload, with a lazy backfill and a `POST /projects/{id}/reindex` endpoint for pre-existing docs. Proven live: a query sharing *zero keywords* with the relevant doc still retrieved and cited it.
   - **Projects share context with their chats**: a chat created inside a project inherits that project's knowledge automatically. The stream handler resolves the project as `payload.project_id or session.project_id`, so the composer's explicit choice wins but the session's own project is used otherwise instead of silently dropping context.
8. Environment auto-loading: `backend/app/config.py` loads `.env` (backend dir, then repo root) at import time with zero extra dependencies; real environment variables always win over file values.
9. Database path anchoring: a relative `sqlite:///` URL is resolved against the backend directory (`database.py`), so `uvicorn` from `backend/`, `--app-dir` from the repo root, pytest, and Docker all open the *same* file instead of creating stray per-cwd databases.
10. Security scoping: earlier iterations exposed raw filesystem scan/read/write endpoints for a workspace browser. They were removed because arbitrary-path file access from an HTTP API is a path-traversal liability; a regression test documents the removal. CORS uses an explicit localhost allowlist (env-overridable) instead of a wildcard, and chat messages are length-validated (1 to 32k chars).
11. Streaming concurrency model: the stream endpoint is a sync generator, which Starlette automatically iterates in its threadpool — the event loop is never blocked, and the code stays simple to reason about for this scale. At higher concurrency the same contract would move to async generators with the provider SDK's async client.
12. Docker persistence: Docker Compose stores SQLite data under `/app/data/chats.db` via a named volume.

## Local Setup

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env` and add your own key if you want live Gemini responses:

```bash
GOOGLE_AI_API_KEY=        # or GEMINI_API_KEY
GEMINI_MODEL=             # optional model override
DATABASE_URL=sqlite:///./data/chats.db
CORS_ALLOW_ORIGINS=       # optional, defaults to localhost:3000
```

The backend auto-loads `.env` on startup (no `export` step needed); variables already present in the real environment take precedence. Do not commit real API keys. The app works without keys through the clearly-labeled offline fallback.

## Docker

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

## Testing Methodology

Run backend tests:

```bash
backend\.venv\Scripts\python.exe -m pytest backend\app\tests.py -v
```

### Approach

The suite (23 tests) runs against an in-memory SQLite database with the FastAPI dependency override, so tests are fast, isolated, and never touch real data. The LLM layer is monkeypatched at the seam (`stream_chat_response`) for behavior tests, which means the tests assert *our* contract — event framing, persistence rules, context assembly — rather than a third-party model's output. The deterministic offline fallback additionally lets the full streaming path run end-to-end with no API key, so the same suite passes in CI, in Docker, and on a fresh clone.

Three kinds of coverage, deliberately:

1. Happy paths — session CRUD, SSE framing, persistence, multi-turn memory.
2. Failure paths — mid-stream provider crashes, model failover, invalid input. Streaming systems mostly break on the unhappy path, so these carry the most weight.
3. Guardrail regressions — tests that pin down security and budget decisions (removed filesystem endpoints, history trimming) so they cannot silently regress.

### Requirement-to-test traceability

| Requirement / risk | Test |
| --- | --- |
| Streaming endpoint emits SSE token-by-token with correct framing | `test_streaming_endpoint_and_db_persistence` |
| Session memory: LLM sees previous questions | `test_multi_turn_memory_uses_previous_session_messages` |
| User + assistant messages persist to the database | `test_streaming_endpoint_and_db_persistence` |
| Partial output is NOT persisted when the provider dies mid-stream | `test_failed_stream_does_not_persist_assistant_message` |
| Session CRUD lifecycle | `test_create_and_list_sessions`, `test_get_session_details`, `test_delete_session` |
| Context assembly: per-turn data reaches the message and agent steering reaches the system prompt, without polluting stored chat | `test_stream_payload_augments_model_history_without_polluting_chat` |
| System prompt composes base behavior + agent role + project-grounding directive | `test_build_system_instruction_composes_base_agent_and_project_grounding` |
| Project knowledge stays isolated between projects, and selecting one flips the system prompt into cited-grounding mode | `test_stream_payload_includes_only_selected_project_documents` |
| Semantic retrieval ranks the relevant chunk above an irrelevant one and cites it | `test_semantic_retrieval_ranks_relevant_chunk_first` |
| Retrieval degrades to keyword ranking when embeddings are unavailable | `test_project_retrieval_falls_back_to_keyword_without_embeddings` |
| A chat created inside a project inherits its knowledge without re-selecting it | `test_session_inherits_project_binding_without_payload_project` |
| Orchestrated multi-agent stream emits stages in order and persists | `test_orchestrated_stream_emits_agent_stages_and_persists` |
| Provider quota/failure fails over to lighter models | `test_gemini_failover_tries_lighter_model` |
| Offline fallback stays structured and honest | `test_local_fallback_returns_structured_answer_not_placeholder` |
| Input validation rejects blank/oversized messages before any write | `test_stream_rejects_blank_and_oversized_messages` |
| Long histories are trimmed to the provider budget, newest message always kept | `test_trim_history_keeps_newest_messages_within_budget` |
| Removed filesystem endpoints stay removed (security regression) | `test_raw_filesystem_endpoints_are_removed` |
| `.env` auto-loading semantics (precedence, blanks, quotes) | `test_env_loader_reads_files_without_overriding_existing` |
| API keys are never echoed back in responses | `test_provider_agent_project_settings_and_workspace_lifecycle` |
| Operational surface: health, metrics, export, quality report | `test_health_metrics_export_and_quality_report` |

### What I would add next

- Contract tests against a recorded Gemini SSE fixture (verifies our parser against real wire format without network flakiness).
- Playwright smoke test: send a message in the browser, assert tokens render incrementally.
- Load test of concurrent streams (locust/k6) to size the threadpool before production traffic.

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

## Introductory Slide Content

### Project Experience

1. xFitness Gym Platform: built Next.js admin flows, React Native member apps, and IoT gate integrations. Key challenge: low-level smart-card APDU handling and syncing access state into local face-recognition gate databases.
2. Mechtell 3D: built a CAD-to-Web industrial configurator. Key challenge: optimized Blender/WebGL assets and integrated Gemini-generated scene variants.
3. Poket and Heltar Automation: built MCP and Playwright automation for business workflows. Key challenge: reducing manual portal setup workflows from hours to minutes.

### Motivation For Joining Maistorage

I am interested in the R&D role because it sits at the intersection of LLM deployment, systems optimization, and practical full-stack delivery. The role's focus on GPU/iGPU constraints, KV cache management, FastAPI services, and Dockerized AI workloads matches the type of engineering I want to deepen.

### Value Proposition

I can contribute across the stack: Python/FastAPI backend work, TypeScript/Next.js UI delivery, LLM API integration, agentic workflows, and deployment packaging. For this interview, I prepared by building a working streaming chat system and reviewing inference optimization topics such as quantization, KV cache compression, paged attention, and constrained-device deployment.
