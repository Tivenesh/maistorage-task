import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

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

class SessionResponse(BaseModel):
    id: str
    title: str
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

class ChatRequest(BaseModel):
    message: str
    agent_id: str = "general"
    model: Optional[str] = None
    provider_id: Optional[str] = None
    project_id: Optional[str] = None
    search_mode: bool = False
    web_search: bool = False
    attachments: List[AttachmentPayload] = Field(default_factory=list)
