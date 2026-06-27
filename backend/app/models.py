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
    created_at = Column(DateTime, default=_utcnow)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    session = relationship("ChatSession", back_populates="messages")

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

class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    project = relationship("Project", back_populates="documents")

class AgentConfig(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    system_prompt = Column(Text, nullable=False, default="")
    provider_id = Column(String, ForeignKey("llm_providers.id"), nullable=True)
    model = Column(String, nullable=False, default="gemini-2.5-pro-preview-03-25")
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
    theme = Column(String, nullable=False, default="light")
    sidebar_collapsed = Column(Boolean, nullable=False, default=False)
    default_model = Column(String, nullable=False, default="gemini-2.5-pro-preview-03-25")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
