# Maistorage AI R&D Chat Task

This project is a compact FastAPI + Next.js implementation for Question 2 of the Maistorage interview task. The UI is branded as Tesseracq Labs as a personal portfolio wrapper, while the technical deliverable focuses on token streaming, chat-session memory, database persistence, testing, and Docker deployment.

## What It Builds

- One FastAPI REST streaming endpoint: `POST /sessions/{session_id}/stream`
- Token-by-token Server-Sent Events (SSE) streaming to the browser
- SQLite-backed chat sessions and message history
- Multi-turn context passed back into the LLM provider
- Next.js chat interface with session creation, deletion, history loading, and preset prompts
- Docker Compose deployment for backend and frontend
- Automated backend tests covering session CRUD, streaming persistence, multi-turn memory, and failed stream rollback behavior

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

1. SSE over WebSocket: the app only needs one-way assistant token streaming, so SSE keeps the protocol simple and easy to test.
2. Database-backed memory: every completed user/assistant exchange is saved and later sent back as LLM context for the same session.
3. Safe stream persistence: the assistant message is committed only after the provider stream completes. If the provider fails mid-stream, the partial assistant output is not stored.
4. Local fallback model: if no Gemini key is present, the backend uses a deterministic mock streamer so tests and demos still work offline.
5. Docker persistence: Docker Compose stores SQLite data under `/app/data/chats.db` via a named volume.

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
GOOGLE_AI_API_KEY=
GEMINI_API_KEY=
DATABASE_URL=sqlite:///./data/chats.db
```

Do not commit real API keys. The app works without keys through the mock streaming fallback.

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

Current automated coverage:

- Creates, lists, reads, and deletes chat sessions
- Verifies `text/event-stream` response framing
- Confirms user and assistant messages persist after a successful stream
- Confirms multi-turn memory by asking the model to remember a name across prompts
- Confirms failed provider streams do not persist partial assistant messages

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
