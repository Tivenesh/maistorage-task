# STATE.md — Live Agent Context

## Active Session
- **Project:** maistorage-task
- **Started:** 2026-06-27 12:23:36
- **Objective:** Complete MaiStorage R&D Chat interview task

## Current Status
- [x] Backend: FastAPI + SQLite + SSE streaming + Gemini/mock LLM
- [x] Frontend: Next.js chat UI + sidebar + workspace modals
- [x] Backend tests: 10/10 passing
- [x] Frontend build: zero errors
- [x] Docker Compose deployment ready
- [x] Deprecation fixes: google-genai SDK, timezone-aware UTC
- [x] Model names updated to current Gemini release names

## Last Agent
- **Agent:** opencode
- **File:** backend/app/llm.py
- **Line:** 92
- **Next:** Project is complete and ready for submission

## Decisions
- 2026-06-27: Migrated from deprecated `google.generativeai` to `google.genai` SDK
- 2026-06-27: Replaced deprecated `datetime.utcnow()` with timezone-aware `datetime.now(datetime.UTC)`
- 2026-06-27: Updated default model from `gemini-3.1-pro-preview` to `gemini-2.5-pro-preview-03-25`
