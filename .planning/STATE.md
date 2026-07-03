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
- [x] Reviewer API-key path: sidebar API Keys entry, local provider storage, provider models selectable in chat
- [x] Deep-tech glass UI refresh: MaiStorage wordmark, NAND-inspired background, frosted rails/panels/composer
- [x] Manual browser demo: API Keys panel opened, project RAG workspace verified with `runbook.md`, live Gemini stream returned cited answer
- [x] Motion button pass: installed `motion`, added reusable `MotionButton`, and converted sidebar/modal/project/chat controls to spring hover/tap interactions
- [x] Premium motion pass: shared spring tokens, app MotionConfig, animated sidebar collapse/search, modal backdrop/panel lifecycle, chat/project/list layout transitions
- [x] Theme transition pass: light/dark mode crossfades through an old-theme overlay with smoother color/background transitions

## Last Agent
- **Agent:** codex
- **File:** frontend/src/app/page.tsx + frontend/src/app/globals.css
- **Line:** Theme crossfade overlay verified in fresh browser tab; stale `sessionStartedAt` runtime path no longer exists in source
- **Next:** Docker frontend rebuild is blocked by npm ci lock mismatch for Linux optional `@emnapi/*`; current preview uses local `npm run dev` on port 3000

## Decisions
- 2026-06-27: Migrated from deprecated `google.generativeai` to `google.genai` SDK
- 2026-06-27: Replaced deprecated `datetime.utcnow()` with timezone-aware `datetime.now(datetime.UTC)`
- 2026-06-27: Updated default model from `gemini-3.1-pro-preview` to `gemini-2.5-pro-preview-03-25`
- 2026-07-02: Added a live frontend overview rail on the main chat screen; exact billed cost still requires provider usage metadata.
- 2026-07-03: Added lightweight semantic RAG without external vector infrastructure: chunks + JSON vectors in SQLite, Gemini embeddings when configured, keyword fallback otherwise.
- 2026-07-03: Replaced the project dropdown demo path with a NotebookLM/Gemini-style project workspace so shared sources are uploaded once and reused across project chats.
- 2026-07-03: Verified `docker compose up --build -d` after frontend lockfile, `.dockerignore`, and embedding-model environment fixes.
- 2026-07-03: `init-project`/STATE discipline is documented in `AGENTS.md` but not enforced by hooks or CI in this checkout.
- 2026-07-03: Added explicit reviewer API-key setup in the UI and README; no real API key is committed, and provider responses expose only previews.
- 2026-07-03: Rebranded the chat shell from the old TL mark to the supplied MaiStorage wordmark and kept the three-column app layout while moving the theme to dark glassmorphism.
- 2026-07-03: Verified manual browser flow on `http://localhost:3000`: API Keys settings panel renders, a fresh `MaiStorage RAG Demo 20260703130419` project shows `runbook.md` as indexed, project-bound chat completed with `[runbook.md]` citations for phase 2/write amplification/rollback readiness, and backend export includes the runbook answer.
- 2026-07-03: Converted visible buttons and clickable icon controls to `motion/react` via `MotionButton`; standard controls use spring `scale: 1.02/0.98`, icon controls use `scale: 1.1/0.95`. Verified `npm run lint`, `npm run build`, and browser API Keys interaction smoke.
- 2026-07-03: Overview telemetry pass started; backend stream now sends non-secret run metadata and a final committed run summary event for accurate request/runtime accounting.
- 2026-07-03: Expanded motion system after feedback that interactions still felt snappy: removed global Motion reduced-motion suppression that muted transforms on this machine, retuned spring presets, added focus/hover/tap lift/shadow/filter states, animated sidebar label/search lifecycle, settings/API modal backdrop and panel, project source/chat rows, chat messages, workspace file rows, and attachment chips. Fresh browser tab smoke passed with no console errors.
- 2026-07-03: Overview timer semantics changed from page-open duration to accumulated active stream runtime: submit starts the timer, final run/end/error pauses it, and old sessions hydrate from `/sessions/{session_id}/runs`.
- 2026-07-03: Light/dark switching now keeps the previous theme as a fading overlay while the new theme animates underneath; CSS timing was softened and reduced-motion clamping relaxed so the transition is visible on this machine.


