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
- **Next:** 2026-07-03 codex readiness/deploy pass in progress; validate backend tests, frontend lint/build, Docker, secret hygiene, then deploy only if the public runtime is honest.
- **Validation:** 2026-07-03 codex ran backend pytest, frontend lint, and frontend production build; all passed.
- **Runtime:** 2026-07-03 codex verified local backend `/health`, frontend `http://127.0.0.1:3000`, and a live SSE chat stream with metadata/token/run/end events.
- **Security:** 2026-07-03 codex confirmed `.env` is ignored and tracked-file secret pattern scan found no hits; MCP secret scan failed on Windows encoding. `npm audit --omit=dev --audit-level=high` found no high/critical issues, only a moderate Next/PostCSS advisory with no clean non-breaking fix.
- **Submission:** 2026-07-03 codex updated `SUBMISSION_EMAIL_DRAFT.md` for the chosen Docker Compose/local review route; reviewers clone repo, add their own optional API key, and run full stack locally.
- **Presentation:** 2026-07-03 codex simplified `LIVE_DEMO_SCRIPT.md` into an easy interview script with short spoken lines, exact clicks, demo prompts, and simple fallback lines.
- **Demo Source:** 2026-07-04 codex created `demo-sources/runbook.md` for the project RAG upload step.

## Sniper Spec — 2026-07-03 Submission Readiness
- Target files: README.md, docker-compose.yml, backend/app/main.py, backend/app/tests.py, frontend/src/app/page.tsx, frontend/src/components/SessionSidebar.tsx.
- Current risk: Vercel can host the Next.js frontend, but the FastAPI backend needs a reachable host/API URL for a usable public demo.
- Validation 1: run `backend\.venv\Scripts\python.exe -m pytest backend\app\tests.py -v`.
- Validation 2: run `npm run lint` and `npm run build` inside `frontend`.
- Validation 3: run Docker Compose rebuild if local Docker is available.
- Security check: scan tracked files and avoid printing or committing `.env` secrets.
- Deploy plan: use authenticated Vercel CLI for preview only unless production is explicitly requested.
- Backend plan: if no public backend is available, mark deployment as frontend preview only and submit Docker instructions as the runnable full-stack path.
- Submission draft: include repo, deployment URL if valid, Docker/local setup, implemented features, tests passed, and API-key setup.
- Rollback: revert only files changed during this pass; do not discard existing uncommitted app changes.
- Agent identity: codex.
- Current line: readiness validation starting.
- Next step: run tests and build checks.

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
- 2026-07-03: Submission readiness pass verified `backend\.venv\Scripts\python.exe -m pytest backend\app\tests.py -v` with 25 passed, `npm run lint` clean, and `npm run build` successful.
- 2026-07-03: Local runtime smoke passed on existing services: backend health OK, frontend returned 200, and `POST /sessions/{id}/stream` completed with Gemini-backed SSE token events.
- 2026-07-03: Docker Compose re-verification was blocked because Docker Desktop Linux engine was not running; do not claim fresh Docker proof until the daemon is available again.
- 2026-07-03: Submission email now avoids a broken frontend-only public link and frames Docker Compose as the review path for the full frontend/backend/streaming system.
- 2026-07-03: Interview presentation route changed from slides to showing actual work; use the simplified `LIVE_DEMO_SCRIPT.md` for rehearsal and keep `PRESENTATION_PLAN.md` as optional background only.
- 2026-07-04: Demo RAG source file now exists at `demo-sources/runbook.md`; upload this during the live project workspace demo.


