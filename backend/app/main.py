import json
import asyncio
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from datetime import datetime

from .database import engine, wait_for_db
from .models import Base
from app.routers import commands, macro_groups, macros, arr_instances, script_runs, agent, schedules
from .redis_client import get_redis_client
from .utils.scheduler import start_scheduler, shutdown_scheduler

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Wait for the database to be ready
    if wait_for_db():
        # Create tables
        Base.metadata.create_all(engine)
        # Start the scheduler
        start_scheduler()
    else:
        print("Warning: Database was not ready. Tables were not created.")
    yield
    # Shutdown the scheduler
    shutdown_scheduler()

app = FastAPI(title="ServerToolPython API", lifespan=lifespan)

# Include routers
app.include_router(commands.router)
app.include_router(macros.router)
app.include_router(macro_groups.router)
app.include_router(arr_instances.router)
app.include_router(script_runs.router)
app.include_router(agent.router)
app.include_router(schedules.router)

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
    
    # Use redis.asyncio for non-blocking pub/sub
    import redis.asyncio as aioredis
    import os
    
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

    # Start the pubsub listener in the background
    listener_task = asyncio.create_task(listen_to_responses())

    try:
        while True:
            # Just keep the connection alive, we don't expect commands here anymore
            await websocket.receive_text()
    except WebSocketDisconnect:
        print("Client disconnected from terminal WebSocket")
    finally:
        listener_task.cancel()
        await pubsub.unsubscribe("agent_responses")
        await r.close()