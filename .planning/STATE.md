# STATE.md — Live Agent Context

## Active Session
- **Project:** maistorage-task
- **Started:** 2026-06-27 12:23:36
- **Objective:** Complete MaiStorage R&D Chat interview task

## Current Status
- [x] Backend: FastAPI + SQLite + SSE streaming + Gemini/mock LLM
- [x] Frontend: Next.js chat UI + sidebar + workspace modals + notebook-style project workspace
- [x] Backend tests: 23/23 passing
- [x] Frontend lint/build: zero errors
- [x] Docker Compose deployment verified end-to-end
- [x] Deprecation fixes: google-genai SDK, timezone-aware UTC
- [x] Model names updated to current Gemini release names
- [x] Semantic project RAG: SQLite `document_chunks`, Gemini embeddings, cosine retrieval, keyword fallback
- [x] Project binding: chats created inside a project inherit shared project sources
- [x] Notebook-style project UX: sidebar project opens source workspace; multiple chats share universal project files
- [x] Docker RAG fix: non-empty `GEMINI_EMBEDDING_MODEL` default verified in containers
- [x] Frontend Docker fix: lockfile regenerated for `npm ci`; `.dockerignore` added

## Last Agent
- **Agent:** codex
- **File:** frontend/src/components/ProjectWorkspace.tsx
- **Line:** notebook-style project workspace added and Docker build verified
- **Next:** Manual browser demo: create/select project, upload `runbook.md`, start multiple project chats, verify all chats cite shared sources

## Decisions
- 2026-06-27: Migrated from deprecated `google.generativeai` to `google.genai` SDK
- 2026-06-27: Replaced deprecated `datetime.utcnow()` with timezone-aware `datetime.now(datetime.UTC)`
- 2026-06-27: Updated default model from `gemini-3.1-pro-preview` to `gemini-2.5-pro-preview-03-25`
- 2026-07-02: Added a live frontend overview rail on the main chat screen; exact billed cost still requires provider usage metadata.
- 2026-07-03: Added lightweight semantic RAG without external vector infrastructure: chunks + JSON vectors in SQLite, Gemini embeddings when configured, keyword fallback otherwise.
- 2026-07-03: Replaced the project dropdown demo path with a NotebookLM/Gemini-style project workspace so shared sources are uploaded once and reused across project chats.
- 2026-07-03: Verified `docker compose up --build -d` after frontend lockfile, `.dockerignore`, and embedding-model environment fixes.
- 2026-07-03: `init-project`/STATE discipline is documented in `AGENTS.md` but not enforced by hooks or CI in this checkout.
