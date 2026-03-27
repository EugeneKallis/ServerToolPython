#!/usr/bin/env python3
import asyncio
import os
import json
import requests
import uuid
import redis.asyncio as redis
from datetime import datetime, timedelta, timezone

class ArrInstance:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id')
        self.name = kwargs.get('name')
        self.type = kwargs.get('type')
        self.url = kwargs.get('url')
        self.api_key = kwargs.get('api_key')
        self.enabled = kwargs.get('enabled')

ACTIVE_INSTANCES = {}  # In-memory dictionary: instance_id -> ArrInstance

TIMEOUT = 30  # seconds

def get_json(url: str, api_key: str):
    resp = requests.get(url, headers={"X-Api-Key": api_key}, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def post_command(base_url: str, api_key: str, body: dict):
    url = base_url.rstrip("/") + "/api/v3/command"
    resp = requests.post(
        url,
        headers={"X-Api-Key": api_key, "Content-Type": "application/json"},
        data=json.dumps(body),
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp

def parse_date(date_str: str) -> datetime | None:
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    return None

def released_24h_ago(date_str: str) -> bool:
    dt = parse_date(date_str)
    if dt is None:
        return False
    return dt + timedelta(hours=24) <= datetime.now(tz=timezone.utc)

def search_radarr_missing(instance: ArrInstance, dispatch_log=None):
    base = instance.url.rstrip("/")
    dispatch_log(f"[Radarr] {instance.name}: fetching movies \u2026")
    try:
        movies = get_json(f"{base}/api/v3/movie", instance.api_key)
    except Exception as e:
        dispatch_log(f"[Radarr] {instance.name}: ERROR fetching movies: {e}")
        return

    for m in movies:
        if m.get("hasFile") or not m.get("monitored"):
            continue

        release = m.get("physicalRelease") or m.get("inCinemas") or ""
        if not released_24h_ago(release):
            continue

        try:
            post_command(base, instance.api_key, {
                "name": "MoviesSearch",
                "movieIds": [m["id"]],
            })
            dispatch_log(f"[Radarr] {instance.name}: searched missing movie: {m['title']}")
        except Exception as e:
            dispatch_log(f"[Radarr] {instance.name}: ERROR searching '{m['title']}': {e}")

def search_sonarr_missing(instance: ArrInstance, dispatch_log=None):
    base = instance.url.rstrip("/")
    dispatch_log(f"[Sonarr] {instance.name}: fetching series \u2026")
    try:
        series_list = get_json(f"{base}/api/v3/series", instance.api_key)
    except Exception as e:
        dispatch_log(f"[Sonarr] {instance.name}: ERROR fetching series: {e}")
        return

    for series in series_list:
        try:
            episodes = get_json(
                f"{base}/api/v3/episode?seriesId={series['id']}", instance.api_key
            )
        except Exception as e:
            dispatch_log(f"[Sonarr] {instance.name}: ERROR fetching episodes for '{series['title']}': {e}")
            continue

        for ep in episodes:
            if ep.get("hasFile") or not ep.get("monitored"):
                continue
            if not released_24h_ago(ep.get("airDate", "")):
                continue
            try:
                post_command(base, instance.api_key, {
                    "name": "EpisodeSearch",
                    "episodeIds": [ep["id"]],
                })
                dispatch_log(f"[Sonarr] {instance.name}: searched missing episode: "
                             f"{series['title']} \u2013 {ep.get('title', ep['id'])} ({ep['id']})")
            except Exception as e:
                dispatch_log(f"[Sonarr] {instance.name}: ERROR searching episode {ep['id']}: {e}")

async def handle_search_command(r: redis.Redis, data: dict):
    command_type = data.get("type")
    
    # We will log natively to arr_responses so the backend/UI can read it if needed
    def dispatch_log(msg: str):
        print(msg, flush=True)

    if command_type == "search_all":
        instances = [inst for inst in ACTIVE_INSTANCES.values() if inst.enabled]
    elif command_type == "search_instance":
        instance_id = data.get("instance_id")
        inst = ACTIVE_INSTANCES.get(instance_id)
        instances = [inst] if inst else []
    else:
        return

    if not instances:
        dispatch_log("No applicable arr instances to search.")
        return

    for inst in instances:
        if "anime" in inst.name.lower():
            dispatch_log(f"Skipping anime instance: {inst.name}")
            continue
        
        # Using asyncio.to_thread because the requests library is synchronous
        if inst.type == "radarr":
            await asyncio.to_thread(search_radarr_missing, inst, dispatch_log)
        elif inst.type == "sonarr":
            await asyncio.to_thread(search_sonarr_missing, inst, dispatch_log)
        else:
            dispatch_log(f"Unknown instance type '{inst.type}' for {inst.name}, skipping.")
    dispatch_log("Search finished.")

async def handle_config_update(data: list):
    global ACTIVE_INSTANCES
    new_instances = {}
    for inst_data in data:
        inst = ArrInstance(**inst_data)
        new_instances[inst.id] = inst
    ACTIVE_INSTANCES = new_instances
    print(f"Config updated! Now tracking {len(ACTIVE_INSTANCES)} instance(s).", flush=True)

async def config_listener(r: redis.Redis):
    """Listens for config broadcasts that should be received by ALL pods."""
    pubsub = r.pubsub()
    await pubsub.subscribe("arr_config_updates")
    print("Config listener subscribed to 'arr_config_updates' (Pub/Sub).", flush=True)

    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                await handle_config_update(data)
            except Exception as e:
                print(f"Error processing config update: {e}", flush=True)

async def command_worker(r: redis.Redis):
    """Listens for distributed command tasks. Only ONE pod will receive each command."""
    print("Command worker started, waiting for jobs in 'arr_commands' (Queue).", flush=True)
    while True:
        try:
            # brpop returns (channel, data) tuple
            _, data_str = await r.brpop("arr_commands")
            data = json.loads(data_str)
            print(f"Received command from queue: {data}", flush=True)
            # Process search command
            await handle_search_command(r, data)
        except Exception as e:
            print(f"Error in command worker: {e}", flush=True)
            await asyncio.sleep(1) # Backoff if there's a serious error

async def main():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    print(f"Arr Searcher starting, connecting to Redis at {redis_url}...", flush=True)

    r = redis.from_url(redis_url)

    # Initial config request (Pub/Sub)
    print("Requesting initial config...", flush=True)
    await r.publish("arr_config_requests", json.dumps({"type": "request_sync"}))

    # Start the background config listener (must hit ALL replicas)
    asyncio.create_task(config_listener(r))

    # Start the command worker (must hit only ONE replica)
    await command_worker(r)

if __name__ == "__main__":
    asyncio.run(main())
