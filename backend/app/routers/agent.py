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
        # Publish the kill command to the agent_commands channel
        await r.publish("agent_commands", json.dumps({"type": "kill"}))
        return {"status": "success", "message": "Reset command sent to agent."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reset command: {str(e)}")
