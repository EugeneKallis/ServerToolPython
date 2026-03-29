from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
import redis.asyncio as redis
import os
import json
import uuid
from datetime import datetime

from ..database import get_session as get_db
from ..models import ShellHistory

router = APIRouter(prefix="/agent", tags=["agent"])

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

async def get_redis():
    r = redis.from_url(REDIS_URL)
    try:
        yield r
    finally:
        await r.aclose()

@router.post("/reset")
async def reset_agent(r: redis.Redis = Depends(get_redis)):
    try:
        await r.publish("agent_control", json.dumps({"type": "kill"}))
        return {"status": "success", "message": "Reset command sent to agent."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reset command: {str(e)}")

class ShellCommandPayload(BaseModel):
    command: str

@router.post("/shell")
async def run_shell_command(
    payload: ShellCommandPayload,
    r: redis.Redis = Depends(get_redis),
    db: Session = Depends(get_db),
):
    command = payload.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    # Deduplicate: remove existing entry for same command, then insert at top
    db.execute(delete(ShellHistory).where(ShellHistory.command == command))
    db.add(ShellHistory(command=command, created_at=datetime.utcnow()))
    # Keep only the 100 most recent
    oldest = db.scalars(
        select(ShellHistory).order_by(ShellHistory.created_at.desc()).offset(100)
    ).all()
    for entry in oldest:
        db.delete(entry)
    db.commit()

    run_id = str(uuid.uuid4())
    try:
        await r.lpush("agent_commands", json.dumps({
            "command": command,
            "macro_name": "/shell",
            "run_id": run_id,
            "is_last": True,
        }))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch command: {str(e)}")

    return {"status": "triggered", "run_id": run_id}

@router.get("/shell/history")
async def get_shell_history(db: Session = Depends(get_db)):
    entries = db.scalars(
        select(ShellHistory).order_by(ShellHistory.created_at.desc()).limit(100)
    ).all()
    return [e.command for e in entries]

@router.get("/count")
async def get_agent_count(r: redis.Redis = Depends(get_redis)):
    count = 0
    async for _ in r.scan_iter("agent:heartbeat:*"):
        count += 1
    return {"count": count}
