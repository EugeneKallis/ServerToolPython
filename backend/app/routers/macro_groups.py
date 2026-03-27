from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional

from pydantic import BaseModel

from ..database import get_session
from ..models import MacroGroup, Macro, Command, CommandArgument
from ..schemas import MacroGroupCreate, MacroGroupRead, MacroGroupUpdate


# ── Import payload schemas ────────────────────────────────────────────────────

class ImportArgument(BaseModel):
    arg_name: str
    arg_value: str

class ImportCommand(BaseModel):
    command: str
    ord: int = 0
    arguments: List[ImportArgument] = []

class ImportMacro(BaseModel):
    name: str
    ord: int = 0
    commands: List[ImportCommand] = []

class ImportGroup(BaseModel):
    name: str
    ord: int = 0
    macros: List[ImportMacro] = []

class ImportPayload(BaseModel):
    groups: List[ImportGroup]

router = APIRouter(
    prefix="/macro-groups",
    tags=["macro-groups"],
)

@router.post("", response_model=MacroGroupRead)
def create_macro_group(payload: MacroGroupCreate, session: Session = Depends(get_session)):
    macro_group = MacroGroup(**payload.model_dump())
    session.add(macro_group)
    session.commit()
    session.refresh(macro_group)
    return macro_group

@router.get("", response_model=List[MacroGroupRead])
def get_macro_groups(session: Session = Depends(get_session)):
    return session.scalars(
        select(MacroGroup).options(
            selectinload(MacroGroup.macros).selectinload(Macro.commands)
        ).order_by(MacroGroup.ord)
    ).all()

@router.get("/{id}", response_model=MacroGroupRead)
def get_macro_group(id: int, session: Session = Depends(get_session)):
    macro_group = session.get(MacroGroup, id)
    if not macro_group:
        raise HTTPException(status_code=404, detail="MacroGroup not found")
    return macro_group

@router.patch("/{id}", response_model=MacroGroupRead)
def update_macro_group(id: int, payload: MacroGroupUpdate, session: Session = Depends(get_session)):
    macro_group = session.get(MacroGroup, id)
    if not macro_group:
        raise HTTPException(status_code=404, detail="MacroGroup not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(macro_group, key, value)
    
    session.commit()
    session.refresh(macro_group)
    return macro_group

@router.post("/import", response_model=List[MacroGroupRead])
def import_macro_groups(payload: ImportPayload, session: Session = Depends(get_session)):
    # Delete all existing groups (cascades to macros, commands, arguments)
    existing = session.scalars(select(MacroGroup)).all()
    for group in existing:
        session.delete(group)
    session.flush()

    # Recreate from payload
    created = []
    for g in payload.groups:
        group = MacroGroup(name=g.name, ord=g.ord)
        session.add(group)
        session.flush()
        for m in g.macros:
            macro = Macro(name=m.name, ord=m.ord, macro_group_id=group.id)
            session.add(macro)
            session.flush()
            for c in m.commands:
                command = Command(command=c.command, ord=c.ord, macro_id=macro.id)
                session.add(command)
                session.flush()
                for a in c.arguments:
                    session.add(CommandArgument(arg_name=a.arg_name, arg_value=a.arg_value, command_id=command.id))
        created.append(group)

    session.commit()
    return session.scalars(
        select(MacroGroup).options(
            selectinload(MacroGroup.macros).selectinload(Macro.commands)
        ).order_by(MacroGroup.ord)
    ).all()


@router.delete("/{id}")
def delete_macro_group(id: int, session: Session = Depends(get_session)):
    macro_group = session.get(MacroGroup, id)
    if not macro_group:
        raise HTTPException(status_code=404, detail="MacroGroup not found")
    session.delete(macro_group)
    session.commit()
    return {"message": "MacroGroup deleted"}
