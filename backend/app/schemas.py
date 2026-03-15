from pydantic import BaseModel, ConfigDict
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

class CommandRead(CommandBase):
    id: int
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
