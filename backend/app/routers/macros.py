from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional

from ..database import get_session
from ..models import Macro, Command, CommandArgument
from ..schemas import MacroCreate, MacroRead, MacroUpdate

from pydantic import BaseModel
class ExecuteMacroPayload(BaseModel):
    selected_arguments: Optional[dict[str, List[int]]] = None # command_id (as string key) -> list of arg_ids

router = APIRouter(
    prefix="/macros",
    tags=["macros"],
)

@router.post("", response_model=MacroRead)
def create_macro(payload: MacroCreate, session: Session = Depends(get_session)):
    macro = Macro(**payload.model_dump())
    session.add(macro)
    session.commit()
    session.refresh(macro)
    return macro

@router.get("", response_model=List[MacroRead])
def get_macros(session: Session = Depends(get_session)):
    return session.scalars(
        select(Macro).options(selectinload(Macro.commands)).order_by(Macro.ord)
    ).all()

@router.get("/{id}", response_model=MacroRead)
def get_macro(id: int, session: Session = Depends(get_session)):
    macro = session.get(Macro, id)
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    return macro

@router.patch("/{id}", response_model=MacroRead)
def update_macro(id: int, payload: MacroUpdate, session: Session = Depends(get_session)):
    macro = session.get(Macro, id)
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(macro, key, value)
    
    session.commit()
    session.refresh(macro)
    return macro

@router.delete("/{id}")
def delete_macro(id: int, session: Session = Depends(get_session)):
    macro = session.get(Macro, id)
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    session.delete(macro)
    session.commit()
    return {"message": "Macro deleted"}

@router.post("/{id}/execute")
async def execute_macro(id: int, payload: Optional[ExecuteMacroPayload] = None, session: Session = Depends(get_session)):
    import json
    import os
    import uuid
    import redis.asyncio as aioredis
    
    macro = session.scalars(
        select(Macro)
        .where(Macro.id == id)
        .options(selectinload(Macro.commands).selectinload(Command.arguments))
    ).first()
    
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    
    # Sort commands by ord
    commands = sorted(macro.commands, key=lambda c: c.ord)
    
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    
    run_id = str(uuid.uuid4())
    
    try:
        for idx, cmd in enumerate(commands):
            cmd_text = cmd.command
            is_last = (idx == len(commands) - 1)
            
            # Append optional arguments if selected — values are shell-quoted
            # to prevent injection via argument content
            if payload and payload.selected_arguments:
                import shlex
                selected_ids = payload.selected_arguments.get(str(cmd.id), [])
                for arg in cmd.arguments:
                    if arg.id in selected_ids:
                        cmd_text += f" {shlex.quote(arg.arg_value)}"
            
            payload_data = json.dumps({
                "command": cmd_text.strip(),
                "macro_name": macro.name,
                "run_id": run_id,
                "is_last": is_last
            })
            await r.lpush("agent_commands", payload_data)
    finally:
        await r.close()
        
    return {"status": "triggered", "command_count": len(commands), "run_id": run_id}
