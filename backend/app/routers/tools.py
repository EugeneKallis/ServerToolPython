from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import redis.asyncio as redis
import os
import json
import uuid
import shlex
import asyncio

router = APIRouter(prefix="/tools", tags=["tools"])

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


async def get_redis():
    r = redis.from_url(REDIS_URL)
    try:
        yield r
    finally:
        await r.aclose()


class SpecialCleanerRequest(BaseModel):
    dry_run: bool = False
    min_size_mb: int = 75


@router.post("/special-cleaner/run")
async def run_special_cleaner(
    body: SpecialCleanerRequest,
    r: redis.Redis = Depends(get_redis),
):
    cmd = "python /app/scripts/special_cleaner.py"
    if body.dry_run:
        cmd += " --dry-run"
    cmd += f" --min-size-mb {body.min_size_mb}"

    run_id = str(uuid.uuid4())
    try:
        await r.lpush("agent_commands", json.dumps({
            "command": cmd,
            "macro_name": "special-cleaner",
            "run_id": run_id,
            "is_last": True,
        }))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch command: {str(e)}")

    return {"run_id": run_id}


@router.post("/broken-link-finder/scan")
async def scan_broken_links(
    r: redis.Redis = Depends(get_redis),
):
    run_id = str(uuid.uuid4())
    results = []

    # Create a separate connection for pubsub to manage lifecycle independently
    r_sub = redis.from_url(REDIS_URL)
    pubsub = r_sub.pubsub()
    await pubsub.subscribe("agent_responses")

    try:
        # Publish command AFTER subscribing to avoid missing the response
        await r.lpush("agent_commands", json.dumps({
            "command": "python /app/scripts/broken_link_finder.py --json",
            "macro_name": "broken-link-finder",
            "run_id": run_id,
            "is_last": True,
        }))

        async def collect():
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue

                if data.get("run_id") != run_id:
                    continue

                status = data.get("status")

                if status == "streaming":
                    raw = data.get("message", "")
                    try:
                        parsed = json.loads(raw)
                        if isinstance(parsed, dict) and "path" in parsed:
                            results.append(parsed)
                    except (json.JSONDecodeError, TypeError):
                        pass

                elif status in ("completed", "error"):
                    break

        await asyncio.wait_for(collect(), timeout=300)

    except asyncio.TimeoutError:
        pass
    finally:
        await pubsub.unsubscribe("agent_responses")
        await r_sub.aclose()

    return {"files": results}


class DeleteRequest(BaseModel):
    paths: list[str]


@router.post("/broken-link-finder/delete")
async def delete_broken_links(
    body: DeleteRequest,
    r: redis.Redis = Depends(get_redis),
):
    if not body.paths:
        raise HTTPException(status_code=400, detail="No paths provided")

    cmd = "rm -f " + " ".join(shlex.quote(p) for p in body.paths)
    run_id = str(uuid.uuid4())

    try:
        await r.lpush("agent_commands", json.dumps({
            "command": cmd,
            "macro_name": "broken-link-finder-delete",
            "run_id": run_id,
            "is_last": True,
        }))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch command: {str(e)}")

    return {"run_id": run_id}
