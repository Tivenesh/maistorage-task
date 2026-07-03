import datetime
import uuid
from sqlalchemy import Boolean, Column, String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship
from .database import Base

def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False, default="New Conversation")
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    project = relationship("Project", back_populates="sessions")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    session = relationship("ChatSession", back_populates="messages")

class ChatRun(Base):
    __tablename__ = "chat_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    model = Column(String, nullable=False)
    provider = Column(String, nullable=False, default="gemini")
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    orchestrated = Column(Boolean, nullable=False, default=False)
    status = Column(String, nullable=False, default="running")
    prompt_chars = Column(Integer, nullable=False, default=0)
    response_chars = Column(Integer, nullable=False, default=0)
    duration_ms = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=_utcnow)

class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    api_key = Column(Text, nullable=False)
    base_url = Column(String, nullable=True)
    default_model = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    agents = relationship("AgentConfig", back_populates="provider")

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=_utcnow)

    agents = relationship("AgentConfig", back_populates="project")
    documents = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")
    sessions = relationship("ChatSession", back_populates="project")

class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    project = relationship("Project", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

class DocumentChunk(Base):
    """
    A retrievable slice of a project document plus its embedding vector.
    Stored inside the same SQLite database (embedding as a JSON float array) so
    semantic search needs no separate vector service — laptop- and Docker-safe.
    """
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("project_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False)
    embedding = Column(Text, nullable=False)  # JSON-encoded list[float]
    created_at = Column(DateTime, default=_utcnow)

    document = relationship("ProjectDocument", back_populates="chunks")

class AgentConfig(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    system_prompt = Column(Text, nullable=False, default="")
    provider_id = Column(String, ForeignKey("llm_providers.id"), nullable=True)
    model = Column(String, nullable=False, default="models/gemini-3.1-pro-preview")
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    provider = relationship("LLMProvider", back_populates="agents")
    project = relationship("Project", back_populates="agents")

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    file_tree = Column(Text, nullable=False, default="[]")
    selected_files = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    theme = Column(String, nullable=False, default="dark")
    sidebar_collapsed = Column(Boolean, nullable=False, default=False)
    default_model = Column(String, nullable=False, default="models/gemini-3.1-pro-preview")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
