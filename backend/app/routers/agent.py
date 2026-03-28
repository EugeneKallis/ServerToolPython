from fastapi import APIRouter, Depends, HTTPException
import redis.asyncio as redis
import os
import json

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
        # Publish kill to the control channel so ALL agents receive it
        await r.publish("agent_control", json.dumps({"type": "kill"}))
        return {"status": "success", "message": "Reset command sent to agent."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reset command: {str(e)}")

@router.get("/count")
async def get_agent_count(r: redis.Redis = Depends(get_redis)):
    count = 0
    async for _ in r.scan_iter("agent:heartbeat:*"):
        count += 1
    return {"count": count}
