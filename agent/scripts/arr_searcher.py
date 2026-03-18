#!/usr/bin/env python3
"""
arr_searcher.py

Searches all enabled Radarr/Sonarr instances stored in Postgres for monitored media
that is missing a file and has been released for at least 24 hours, then triggers
a search command via the respective *arr API.

Run manually:
    python scripts/arr_searcher.py

Or schedule it (e.g. via cron inside the agent container).
"""

import os
import json
import requests
import argparse
from datetime import datetime, timedelta, timezone

from db import get_session, ArrInstance

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
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
    """Try common ISO formats; return UTC-aware datetime or None."""
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

# ---------------------------------------------------------------------------
# Radarr
# ---------------------------------------------------------------------------
def search_radarr_missing(instance: ArrInstance, dry_run: bool = False):
    base = instance.url.rstrip("/")
    print(f"[Radarr] {instance.name}: fetching movies …")
    try:
        movies = get_json(f"{base}/api/v3/movie", instance.api_key)
    except Exception as e:
        print(f"[Radarr] {instance.name}: ERROR fetching movies: {e}")
        return

    for m in movies:
        if m.get("hasFile") or not m.get("monitored"):
            continue

        release = m.get("physicalRelease") or m.get("inCinemas") or ""
        if not released_24h_ago(release):
            continue

        try:
            if dry_run:
                print(f"[Radarr] {instance.name}: [DRY-RUN] would search missing movie: {m['title']}")
            else:
                post_command(base, instance.api_key, {
                    "name": "MoviesSearch",
                    "movieIds": [m["id"]],
                })
                print(f"[Radarr] {instance.name}: searched missing movie: {m['title']}")
        except Exception as e:
            print(f"[Radarr] {instance.name}: ERROR searching '{m['title']}': {e}")

# ---------------------------------------------------------------------------
# Sonarr
# ---------------------------------------------------------------------------
def search_sonarr_missing(instance: ArrInstance, dry_run: bool = False):
    base = instance.url.rstrip("/")
    print(f"[Sonarr] {instance.name}: fetching series …")
    try:
        series_list = get_json(f"{base}/api/v3/series", instance.api_key)
    except Exception as e:
        print(f"[Sonarr] {instance.name}: ERROR fetching series: {e}")
        return

    for series in series_list:
        try:
            episodes = get_json(
                f"{base}/api/v3/episode?seriesId={series['id']}", instance.api_key
            )
        except Exception as e:
            print(f"[Sonarr] {instance.name}: ERROR fetching episodes for '{series['title']}': {e}")
            continue

        for ep in episodes:
            if ep.get("hasFile") or not ep.get("monitored"):
                continue
            if not released_24h_ago(ep.get("airDate", "")):
                continue
            try:
                if dry_run:
                    print(f"[Sonarr] {instance.name}: [DRY-RUN] would search missing episode: "
                          f"{series['title']} – {ep.get('title', ep['id'])} ({ep['id']})")
                else:
                    post_command(base, instance.api_key, {
                        "name": "EpisodeSearch",
                        "episodeIds": [ep["id"]],
                    })
                    print(f"[Sonarr] {instance.name}: searched missing episode: "
                          f"{series['title']} – {ep.get('title', ep['id'])} ({ep['id']})")
            except Exception as e:
                print(f"[Sonarr] {instance.name}: ERROR searching episode {ep['id']}: {e}")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Search missing media in *arr instances.")
    parser.add_argument("--dry-run", action="store_true", help="Output items without searching.")
    args = parser.parse_args()

    with get_session() as db:
        instances = db.query(ArrInstance).filter(ArrInstance.enabled == True).all()

    if not instances:
        print("No enabled arr instances found in database. Add some via the API.")
        return

    for inst in instances:
        # Skip anime instances (matching original Go behaviour)
        if "anime" in inst.name.lower():
            print(f"Skipping anime instance: {inst.name}")
            continue

        if inst.type == "radarr":
            search_radarr_missing(inst, dry_run=args.dry_run)
        elif inst.type == "sonarr":
            search_sonarr_missing(inst, dry_run=args.dry_run)
        else:
            print(f"Unknown instance type '{inst.type}' for {inst.name}, skipping.")

    print("Done searching all instances.")

if __name__ == "__main__":
    main()
