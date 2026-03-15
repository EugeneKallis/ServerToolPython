from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from typing import List

from ..database import get_session
from ..models import Macro
from ..schemas import MacroCreate, MacroRead, MacroUpdate

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
async def execute_macro(id: int, session: Session = Depends(get_session)):
    import json
    import os
    import redis.asyncio as aioredis
    
    macro = session.get(Macro, id)
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    
    # Sort commands by ord
    commands = sorted(macro.commands, key=lambda c: c.ord)
    
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    
    try:
        for cmd in commands:
            payload = json.dumps({"command": cmd.command})
            await r.publish("agent_commands", payload)
    finally:
        await r.close()
        
    return {"status": "triggered", "command_count": len(commands)}
