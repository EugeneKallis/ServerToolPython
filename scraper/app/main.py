import asyncio
import json
import os

import redis.asyncio as aioredis

from app.scrapers import jav141, projectjav, pornrips

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
SCRAPE_INTERVAL_HOURS = 3

_locks: dict[str, asyncio.Lock] = {}


def _get_lock(source: str) -> asyncio.Lock:
    if source not in _locks:
        _locks[source] = asyncio.Lock()
    return _locks[source]


def _sanitize(title: str) -> str:
    return title.replace('"', "").replace("'", "").strip()


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
            items = await loop.run_in_executor(None, _scrape_sync, source)
            if items:
                await _publish_results(r, source, items, force)
        except Exception as e:
            print(f"[scraper] {source} failed: {e}", flush=True)
        finally:
            await _set_status(r, source, False)
            print(f"[scraper] Finished {source}", flush=True)


def _scrape_sync(source: str) -> list[dict]:
    if source == "141jav":
        items = jav141.scrape_pages()
    elif source == "projectjav":
        items = projectjav.scrape_pages()
    elif source == "pornrips":
        items = pornrips.scrape_pages()
    else:
        return []

    print(f"[scraper] {source}: scraped {len(items)} raw items", flush=True)
    return items


async def _publish_results(r: aioredis.Redis, source: str, items: list[dict], force: bool):
    """Publish scraped items to Redis for backend to persist."""
    # Normalize items into a consistent format for the backend listener
    normalized = []
    for item in items:
        identifier = item.get("page_url") or item.get("magnet", "")
        if not identifier:
            print(f"[scraper] {source}: skipping '{item.get('title', '?')}' — no identifier", flush=True)
            continue

        title = _sanitize(item.get("title", ""))

        if source == "projectjav":
            files = []
            for f in item.get("files", []):
                files.append({
                    "magnet_link": f["magnet"],
                    "file_size": f.get("file_size") or None,
                    "seeds": f.get("seeds"),
                    "leechers": f.get("leechers"),
                })
            normalized.append({
                "title": title,
                "image_url": item.get("image") or None,
                "magnet_link": identifier,
                "torrent_link": None,
                "tags": ",".join(item.get("tags", [])) or None,
                "source": source,
                "files": files,
            })
        else:
            images = item.get("images", [])
            image_url = ",".join(images) if images else item.get("image", "")
            normalized.append({
                "title": title,
                "image_url": image_url or None,
                "magnet_link": identifier,
                "torrent_link": item.get("torrent") or None,
                "tags": ",".join(item.get("tags", [])) or None,
                "source": source,
                "files": [],
            })

    payload = json.dumps({"source": source, "force": force, "items": normalized})
    await r.lpush("scraper_results", payload)
    print(f"[scraper] {source}: queued {len(normalized)} items for backend via Redis", flush=True)


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
    r = aioredis.from_url(REDIS_URL, socket_connect_timeout=5, socket_timeout=5)

    asyncio.create_task(auto_scrape_loop(r))
    await command_listener(r)


if __name__ == "__main__":
    asyncio.run(main())
