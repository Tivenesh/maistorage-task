# maistorage-task — Roadmap

## Phase 1: Foundation ✅
- [x] Initialize project (FastAPI + Next.js)
- [x] Set up core infrastructure (SQLite, Docker, SSE streaming)
- [x] Define architecture (backend/frontend split, REST + SSE)

## Phase 2: Core Features ✅
- [x] Session CRUD (create, list, get, delete)
- [x] Token-by-token SSE streaming from Gemini / mock
- [x] SQLite-backed message persistence
- [x] Multi-turn memory across session messages
- [x] LLM provider management (Gemini, OpenAI, Anthropic, DeepSeek, OpenRouter)
- [x] Agent configs with custom system prompts
- [x] Projects with shared source upload and semantic RAG context
- [x] Notebook-style project workspace with multiple project-bound chats
- [x] SQLite `document_chunks` vector storage with Gemini embeddings and keyword fallback
- [x] Code workspace (folder selection, file tree, editor)
- [x] Web search augmentation (Wikipedia OpenSearch)
- [x] Voice input (Web Speech API)
- [x] Collapsible sidebar, settings panel, theme toggle

## Phase 3: Polish & Ship ✅
- [x] 23 automated backend tests (all passing)
- [x] Frontend builds with zero errors (Next.js standalone)
- [x] Docker Compose for backend + frontend, verified with `docker compose up --build -d`
- [x] Documentation (README, API docs at /docs)
- [x] Manual demo flow: upload `runbook.md`, ask deployment question, receive cited `FALCON-9` answer
