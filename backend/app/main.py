import json
import asyncio
import os
from datetime import datetime, timezone
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, APIRouter

from .database import engine, wait_for_db
from .models import Base, ScriptRun, ChatConversation, ChatMessage
from app.routers import commands, macro_groups, macros, arr_instances, script_runs, agent, schedules, chat
from .redis_client import get_redis_client
from .utils.scheduler import start_scheduler, shutdown_scheduler

from contextlib import asynccontextmanager

# ── Run-log listener ──────────────────────────────────────────────────────────
# Tracks in-flight runs keyed by run_id (UUID from agent)
_active_output: dict[str, list] = {}  # run_id → list of output lines
_active_started: dict[str, datetime] = {}  # run_id → started_at

async def run_log_listener():
    """
    Subscribes to agent_responses and writes ScriptRun entries to the DB.
    Uses run_id for deduplication to handle multiple backend worker processes.
    """
    import redis.asyncio as aioredis
    from sqlalchemy import select
    from sqlalchemy.orm import Session
    
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe("agent_responses")
    print("Run-log listener subscribed to agent_responses", flush=True)

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            status = data.get("status")
            run_id = data.get("run_id")
            command = data.get("command", "")
            macro_name = data.get("macro_name", command[:80])

            if not run_id:
                continue

            if status == "started":
                _active_output[run_id] = []
                with Session(engine) as db:
                    # check if this run_id already exists (consolidated macro run)
                    run = db.execute(select(ScriptRun).where(ScriptRun.run_id == run_id)).scalar()
                    if not run:
                        started_at = datetime.now(timezone.utc).replace(tzinfo=None)
                        _active_started[run_id] = started_at
                        run = ScriptRun(
                            run_id=run_id,
                            macro_name=macro_name or command[:80],
                            started_at=started_at,
                            success=None,
                        )
                        db.add(run)
                        db.commit()
                    else:
                        # Append command header to existing run
                        run.output = (run.output or "") + f"\n\n--- Executing: {command} ---\n"
                        db.commit()

            elif status == "streaming":
                line = data.get("message") or data.get("error", "")
                if run_id in _active_output:
                    _active_output[run_id].append(line)

            elif status in ("completed", "error", "reset"):
                output_lines = _active_output.pop(run_id, [])
                started_at = _active_started.get(run_id) # Don't pop yet as more commands might follow
                is_last = data.get("is_last", True)
                
                finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
                duration = (finished_at - started_at).total_seconds() if started_at else None
                success = (status == "completed")
                
                with Session(engine) as db:
                    run = db.execute(select(ScriptRun).where(ScriptRun.run_id == run_id)).scalar()
                    if run:
                        # Update output (accumulate)
                        new_output = (run.output or "") + "\n".join(output_lines)
                        run.output = new_output
                        
                        # Update status
                        exit_code = data.get("exit_code", 0)
                        
                        if status == "error" or exit_code != 0:
                            run.success = False
                        elif status == "completed" and is_last:
                            # Only set to True if no previous command in this macro failed
                            if run.success is not False:
                                run.success = True
                            
                        run.finished_at = finished_at
                        if started_at:
                            run.duration_seconds = round(duration, 2)
                        
                        db.commit()
                
                if is_last:
                    _active_started.pop(run_id, None)

        except Exception as e:
            print(f"[run_log_listener] Error: {e}", flush=True)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if wait_for_db():
        Base.metadata.create_all(engine)
        start_scheduler()
    else:
        print("Warning: Database was not ready. Tables were not created.")

    # Start the background run-log listener
    listener_task = asyncio.create_task(run_log_listener())

    yield

    listener_task.cancel()
    shutdown_scheduler()

app = FastAPI(title="ServerToolPython API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")
api_router.include_router(commands.router)
api_router.include_router(macros.router)
api_router.include_router(macro_groups.router)
api_router.include_router(arr_instances.router)
api_router.include_router(script_runs.router)
api_router.include_router(agent.router)
api_router.include_router(schedules.router)
api_router.include_router(chat.router)

app.include_router(api_router)

@app.get("/")
async def index(request: Request):
    redis_status = "offline"
    try:
        r = get_redis_client()
        if r.ping():
            redis_status = "online"
    except Exception:
        pass

    return {
        "status": "online",
        "redis_status": redis_status,
        "message": "ServerToolPython API",
        "version": "1.0.0-core",
        "timestamp": datetime.now().isoformat()
    }

@app.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to terminal WebSocket")

    import redis.asyncio as aioredis
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe("agent_responses")

    async def listen_to_responses():
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await websocket.send_text(message["data"].decode("utf-8"))
        except Exception as e:
            print(f"Error in pubsub listener: {e}")

    listener_task = asyncio.create_task(listen_to_responses())

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        print("Client disconnected from terminal WebSocket")
    finally:
        listener_task.cancel()
        await pubsub.unsubscribe("agent_responses")
        await r.close()