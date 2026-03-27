from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List

class CommandBase(BaseModel):
    ord: int = 0
    command: str
    macro_id: Optional[int] = None

class CommandCreate(CommandBase):
    pass

class CommandUpdate(BaseModel):
    ord: Optional[int] = None
    command: Optional[str] = None
    macro_id: Optional[int] = None

class CommandArgumentBase(BaseModel):
    arg_name: str
    arg_value: str

class CommandArgumentCreate(CommandArgumentBase):
    pass

class CommandArgumentRead(CommandArgumentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class CommandRead(CommandBase):
    id: int
    arguments: List[CommandArgumentRead] = []
    model_config = ConfigDict(from_attributes=True)

class MacroBase(BaseModel):
    name: str
    ord: int = 0
    macro_group_id: Optional[int] = None

class MacroCreate(MacroBase):
    pass

class MacroUpdate(BaseModel):
    name: Optional[str] = None
    ord: Optional[int] = None
    macro_group_id: Optional[int] = None

class MacroRead(MacroBase):
    id: int
    commands: List[CommandRead] = []
    model_config = ConfigDict(from_attributes=True)

class MacroGroupBase(BaseModel):
    name: str
    ord: int = 0

class MacroGroupCreate(MacroGroupBase):
    pass

class MacroGroupUpdate(BaseModel):
    name: Optional[str] = None
    ord: Optional[int] = None

class MacroGroupRead(MacroGroupBase):
    id: int
    macros: List[MacroRead] = []
    model_config = ConfigDict(from_attributes=True)

class ArrInstanceBase(BaseModel):
    name: str
    type: str  # "radarr" or "sonarr"
    url: str
    api_key: str
    enabled: bool = True

class ArrInstanceCreate(ArrInstanceBase):
    pass

class ArrInstanceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    api_key: Optional[str] = None
    enabled: Optional[bool] = None

class ArrInstanceRead(ArrInstanceBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ScriptRunRead(BaseModel):
    id: int
    macro_name: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    success: Optional[bool] = None
    output: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class MacroScheduleBase(BaseModel):
    name: str
    macro_id: int
    cron_expression: str
    enabled: bool = True
    args: Optional[str] = None

class MacroScheduleCreate(MacroScheduleBase):
    pass

class MacroScheduleRead(MacroScheduleBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    role: str
    content: str

class ChatMessageRead(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ChatConversationCreate(BaseModel):
    title: str = "New Chat"
    model: str

class ChatConversationUpdate(BaseModel):
    title: Optional[str] = None

class ChatConversationRead(BaseModel):
    id: int
    title: str
    model: str
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageRead] = []
    model_config = ConfigDict(from_attributes=True)
