import asyncio
import json
import os
from datetime import datetime, timezone, timedelta

import redis.asyncio as aioredis
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.scrapers import jav141, projectjav, pornrips
from app.models import ScrapedItem, ScrapedItemFile

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/postgres")
SCRAPE_INTERVAL_HOURS = 3
CLEANUP_DAYS = 20

engine = create_engine(DATABASE_URL)

_locks: dict[str, asyncio.Lock] = {}


def _get_lock(source: str) -> asyncio.Lock:
    if source not in _locks:
        _locks[source] = asyncio.Lock()
    return _locks[source]


def _sanitize(title: str) -> str:
    return title.replace('"', "").replace("'", "").strip()


def _cleanup_old(session: Session):
    cutoff = datetime.now(timezone.utc) - timedelta(days=CLEANUP_DAYS)
    old = session.scalars(
        select(ScrapedItem).where(
            ScrapedItem.is_hidden == True,
            ScrapedItem.created_at < cutoff,
        )
    ).all()
    for item in old:
        session.delete(item)
    if old:
        session.commit()
        print(f"[scraper] Cleaned up {len(old)} old hidden items", flush=True)


async def _set_status(r: aioredis.Redis, source: str, running: bool):
    await r.set(f"scraper:status:{source}", "1" if running else "0", ex=3600)


async def run_scrape(source: str, force: bool, r: aioredis.Redis):
    lock = _get_lock(source)
    if lock.locked():
        print(f"[scraper] {source} already running, skipping", flush=True)
        return

    async with lock:
        await _set_status(r, source, True)
        print(f"[scraper] Starting {source} (force={force})", flush=True)
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _scrape_sync, source, force)
        except Exception as e:
            print(f"[scraper] {source} failed: {e}", flush=True)
        finally:
            await _set_status(r, source, False)
            print(f"[scraper] Finished {source}", flush=True)


def _scrape_sync(source: str, force: bool):
    if source == "141jav":
        items = jav141.scrape_pages()
    elif source == "projectjav":
        items = projectjav.scrape_pages()
    elif source == "pornrips":
        items = pornrips.scrape_pages()
    else:
        return

    with Session(engine) as session:
        _cleanup_old(session)
        new_count = 0

        for item in items:
            identifier = item.get("page_url") or item.get("magnet", "")
            if not identifier:
                continue

            existing = session.scalars(
                select(ScrapedItem).where(ScrapedItem.magnet_link == identifier)
            ).first()

            if existing and not force:
                continue

            if not existing:
                title = _sanitize(item["title"])
                tags_str = ",".join(item.get("tags", []))

                if source == "projectjav":
                    db_item = ScrapedItem(
                        title=title,
                        image_url=item.get("image") or None,
                        magnet_link=identifier,
                        torrent_link=None,
                        tags=tags_str or None,
                        source=source,
                    )
                    session.add(db_item)
                    session.flush()
                    for f in item.get("files", []):
                        try:
                            session.add(ScrapedItemFile(
                                item_id=db_item.id,
                                magnet_link=f["magnet"],
                                file_size=f.get("file_size") or None,
                                seeds=f.get("seeds"),
                                leechers=f.get("leechers"),
                            ))
                            session.flush()
                        except Exception:
                            session.rollback()
                else:
                    images = item.get("images", [])
                    image_url = ",".join(images) if images else item.get("image", "")
                    db_item = ScrapedItem(
                        title=title,
                        image_url=image_url or None,
                        magnet_link=identifier,
                        torrent_link=item.get("torrent") or None,
                        tags=tags_str or None,
                        source=source,
                    )
                    session.add(db_item)

                try:
                    session.flush()
                    new_count += 1
                except Exception:
                    session.rollback()

        session.commit()
        print(f"[scraper] {source}: added {new_count} new items", flush=True)


async def auto_scrape_loop(r: aioredis.Redis):
    sources = ["141jav", "projectjav", "pornrips"]
    while True:
        print("[scraper] Running scheduled scrape...", flush=True)
        for source in sources:
            await run_scrape(source, False, r)
        print(f"[scraper] Sleeping {SCRAPE_INTERVAL_HOURS}h until next scrape.", flush=True)
        await asyncio.sleep(SCRAPE_INTERVAL_HOURS * 3600)


async def command_listener(r: aioredis.Redis):
    pubsub = r.pubsub()
    await pubsub.subscribe("scraper_commands")
    print("[scraper] Subscribed to scraper_commands", flush=True)

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            if data.get("type") == "scrape":
                source = data.get("source", "141jav")
                force = data.get("force", False)
                asyncio.create_task(run_scrape(source, force, r))
        except Exception as e:
            print(f"[scraper] Command error: {e}", flush=True)


async def main():
    print("[scraper] Scraper service starting...", flush=True)
    r = aioredis.from_url(REDIS_URL)

    for _ in range(30):
        try:
            with Session(engine) as s:
                s.execute(text("SELECT 1"))
            print("[scraper] DB connected.", flush=True)
            break
        except Exception:
            print("[scraper] Waiting for DB...", flush=True)
            await asyncio.sleep(2)

    asyncio.create_task(auto_scrape_loop(r))
    await command_listener(r)


if __name__ == "__main__":
    asyncio.run(main())
