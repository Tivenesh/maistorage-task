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

    def failing_stream(_history, selected_model=None, provider_config=None):
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

def test_stream_payload_augments_model_history_without_polluting_chat(monkeypatch):
    from app import main

    captured_history = []

    def fake_web_context(_query):
        return "- Test result: verified web context"

    def fake_stream(history, selected_model=None, provider_config=None):
        captured_history.extend(history)
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
    assert "Research agent" in model_prompt
    assert "Search mode" in model_prompt
    assert "Test result" in model_prompt
    assert "notes.txt" in model_prompt
    assert "important interview notes" in model_prompt
    assert "summarize this" in model_prompt

    response_details = client.get(f"/sessions/{session_id}")
    messages = response_details.json()["messages"]
    assert messages[0]["content"] == "summarize this"

def test_stream_payload_includes_only_selected_project_documents(monkeypatch):
    from app import main

    captured_history = []

    def fake_stream(history, selected_model=None, provider_config=None):
        captured_history.extend(history)
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
