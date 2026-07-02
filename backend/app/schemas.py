import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Upper bound on a single chat message; keeps a pathological client from
# pushing megabytes through the stream endpoint and into the provider prompt.
MAX_MESSAGE_CHARS = 32_000

class MessageBase(BaseModel):
    role: str
    content: str

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: int
    session_id: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class SessionBase(BaseModel):
    title: str

class SessionCreate(BaseModel):
    title: Optional[str] = "New Conversation"
    project_id: Optional[str] = None

class SessionResponse(BaseModel):
    id: str
    title: str
    project_id: Optional[str] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class SessionDetailResponse(SessionResponse):
    messages: List[MessageResponse] = []

    model_config = ConfigDict(from_attributes=True)

class AttachmentPayload(BaseModel):
    name: str
    content: Optional[str] = None

class ModelInfo(BaseModel):
    id: str
    label: str

class LLMProviderBase(BaseModel):
    provider: str
    display_name: str
    base_url: Optional[str] = None
    default_model: str

class LLMProviderCreate(LLMProviderBase):
    api_key: str

class LLMProviderUpdate(BaseModel):
    provider: Optional[str] = None
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None

class LLMProviderResponse(LLMProviderBase):
    id: str
    api_key_configured: bool
    api_key_preview: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class ProjectDocumentCreate(BaseModel):
    name: str
    content: str

class ProjectDocumentResponse(BaseModel):
    id: str
    project_id: str
    name: str
    content: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    system_prompt: Optional[str] = ""
    provider_id: Optional[str] = None
    model: str
    project_id: Optional[str] = None

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    provider_id: Optional[str] = None
    model: Optional[str] = None
    project_id: Optional[str] = None

class AgentResponse(BaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    provider_id: Optional[str]
    model: str
    project_id: Optional[str]
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class WorkspaceCreate(BaseModel):
    name: str
    file_tree: List[dict] = Field(default_factory=list)
    selected_files: List[AttachmentPayload] = Field(default_factory=list)

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    file_tree: List[dict]
    selected_files: List[AttachmentPayload]
    created_at: datetime.datetime
    updated_at: datetime.datetime

class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    sidebar_collapsed: Optional[bool] = None
    default_model: Optional[str] = None

class SettingsResponse(BaseModel):
    theme: str
    sidebar_collapsed: bool
    default_model: str

class ChatRunResponse(BaseModel):
    id: str
    session_id: str
    model: str
    provider: str
    project_id: Optional[str]
    orchestrated: bool
    status: str
    prompt_chars: int
    response_chars: int
    duration_ms: int
    error: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class HealthResponse(BaseModel):
    status: str
    database: str
    configured_model: str
    gemini_api_configured: bool
    sessions: int
    messages: int
    runs: int

class MetricsResponse(BaseModel):
    sessions: int
    messages: int
    projects: int
    project_documents: int
    document_chunks: int
    workspaces: int
    providers: int
    runs_total: int
    runs_completed: int
    runs_error: int
    average_duration_ms: int

class SessionExportResponse(BaseModel):
    session_id: str
    title: str
    markdown: str

class QualityReportResponse(BaseModel):
    session_id: str
    status: str
    checks: dict
    score: int
    recommendations: List[str]

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    agent_id: str = "general"
    model: Optional[str] = None
    provider_id: Optional[str] = None
    project_id: Optional[str] = None
    search_mode: bool = False
    web_search: bool = False
    orchestrate: bool = False
    attachments: List[AttachmentPayload] = Field(default_factory=list)

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value
