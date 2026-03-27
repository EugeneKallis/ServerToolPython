import json
import os
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

import redis.asyncio as aioredis

from ..database import get_session
from ..models import ScrapedItem, ScrapedItemFile
from ..schemas import ScrapedItemRead

router = APIRouter(prefix="/scraper", tags=["scraper"])

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
BRIDGE_URL = os.getenv("BRIDGE_URL", "https://magnetbridge.ekserver.com/api")
SOURCES = ["141jav", "projectjav", "pornrips"]


async def get_redis():
    r = aioredis.from_url(REDIS_URL)
    try:
        yield r
    finally:
        await r.aclose()


# ── Items ─────────────────────────────────────────────────────────────────────

@router.get("/items", response_model=List[ScrapedItemRead])
def list_items(source: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(ScrapedItem).options(selectinload(ScrapedItem.files)).where(ScrapedItem.is_hidden == False)
    if source:
        q = q.where(ScrapedItem.source == source)
    q = q.order_by(ScrapedItem.created_at.desc())
    return session.scalars(q).all()


@router.patch("/items/{id}/hide")
def hide_item(id: int, session: Session = Depends(get_session)):
    item = session.get(ScrapedItem, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_hidden = True
    session.commit()
    return {"status": "hidden"}


@router.patch("/items/{id}/downloaded")
def mark_downloaded(id: int, session: Session = Depends(get_session)):
    item = session.get(ScrapedItem, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_downloaded = True
    session.commit()
    return {"status": "downloaded"}


@router.post("/items/undo-hide")
def undo_hide(source: str = "141jav", session: Session = Depends(get_session)):
    item = session.scalars(
        select(ScrapedItem)
        .where(ScrapedItem.source == source, ScrapedItem.is_hidden == True)
        .order_by(ScrapedItem.created_at.desc())
        .limit(1)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="No hidden items to undo")
    item.is_hidden = False
    session.commit()
    return {"status": "restored", "id": item.id}


@router.delete("/items")
def delete_items(source: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(ScrapedItem)
    if source:
        q = q.where(ScrapedItem.source == source)
    items = session.scalars(q).all()
    for item in items:
        session.delete(item)
    session.commit()
    return {"deleted": len(items)}


# ── Scraper control ───────────────────────────────────────────────────────────

@router.post("/trigger")
async def trigger_scrape(source: str = "141jav", r: aioredis.Redis = Depends(get_redis)):
    if source not in SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
    await r.publish("scraper_commands", json.dumps({"type": "scrape", "source": source, "force": False}))
    return {"status": "triggered", "source": source}


@router.post("/trigger-all")
async def trigger_all(r: aioredis.Redis = Depends(get_redis)):
    for source in SOURCES:
        await r.publish("scraper_commands", json.dumps({"type": "scrape", "source": source, "force": False}))
    return {"status": "triggered", "sources": SOURCES}


@router.post("/refresh")
async def refresh_source(source: str = "141jav", session: Session = Depends(get_session), r: aioredis.Redis = Depends(get_redis)):
    """Delete items for source then force-rescrape."""
    if source not in SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
    items = session.scalars(select(ScrapedItem).where(ScrapedItem.source == source)).all()
    for item in items:
        session.delete(item)
    session.commit()
    await r.publish("scraper_commands", json.dumps({"type": "scrape", "source": source, "force": True}))
    return {"status": "refreshing", "source": source}


@router.get("/status")
async def scraper_status(r: aioredis.Redis = Depends(get_redis)):
    statuses = {}
    for source in SOURCES:
        val = await r.get(f"scraper:status:{source}")
        statuses[source] = val == b"1" if val else False
    return statuses


# ── Bridge proxy ───────────────────────────────────────────────────────────────

class BridgeRequest(BaseModel):
    url: str
    download_uncached: bool = False


@router.post("/bridge")
async def send_to_bridge(req: BridgeRequest):
    """Proxy a magnet/torrent URL to the magnet bridge service."""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                f"{BRIDGE_URL}/special/add",
                data={
                    "arr": "special",
                    "downloadUncached": str(req.download_uncached).lower(),
                    "urls": req.url,
                },
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return {"status": "sent"}
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Bridge unreachable: {e}")
