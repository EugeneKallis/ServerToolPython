# Project Review Tracker

Issues identified during best practices review. Updated as each item is resolved.

---

## High Priority

| # | Status | Issue | Location | PR |
|---|--------|-------|----------|----|
| 1 | 🚫 N/A | No API authentication — any endpoint can be called by anyone | All routers | — |
| 2 | ✅ Done | Command injection — agent uses `subprocess_shell()` on unsanitized input from DB | `agent/app/main.py:48` | — |
| 3 | ✅ Done | Agent runs privileged + Docker socket mounted — full host access if compromised | `docker-compose.yml:57,61` | — |
| 4 | ✅ Done | Hardcoded DB credentials — `postgres:postgres` in both compose and code | `docker-compose.yml`, `database.py:7` | — |

## Medium Priority

| # | Status | Issue | Location | PR |
|---|--------|-------|----------|----|
| 5 | ✅ Done | Empty initial migration — `upgrade/downgrade` are just `pass` | `migrations/versions/e2d0cb685e97_` | #6 |
| 6 | ✅ Done | Migrations not run in Dockerfile — uvicorn starts before schema exists | `backend/Dockerfile` | #14 |
| 7 | ✅ Done | Seed script calls `drop_all` without any environment guard | `backend/app/seed.py:10` | #4 |
| 8 | ✅ Done | API keys stored/returned in plaintext for ArrInstance | `models.py:76`, `schemas.py:72` | #12 |
| 9 | ✅ Done | `print()` everywhere instead of Python `logging` module | `main.py`, `agent/app/main.py` | #7 |
| 10 | ✅ Done | Unpinned backend dependencies — `requirements.txt` has no version pins | `backend/requirements.txt` | #9 |
| 11 | ✅ Done | Missing CORS middleware on FastAPI | `backend/app/main.py` | #3 |
| 12 | ✅ Done | No Redis connection timeout — hangs indefinitely if Redis is down | Multiple routers | #8 |
| 13 | ✅ Done | `asyncio` in agent requirements.txt — it's a builtin, shouldn't be there | `agent/requirements.txt` | #5 |
| 14 | ✅ Done | Agent Dockerfile curls and runs `get-docker.sh` — supply chain risk | `agent/Dockerfile:9-11` | #5 |

## Low Priority

| # | Status | Issue | Location | PR |
|---|--------|-------|----------|----|
| 15 | ✅ Done | No Docker healthchecks in compose | `docker-compose.yml` | #11 |
| 16 | ✅ Done | Backend/agent containers run as root | `backend/Dockerfile` | #11 |
| 17 | ✅ Done | `schedule` router uses `payload: dict` instead of a Pydantic schema | `backend/app/routers/schedules.py:40` | #10 |
| 18 | ✅ Done | Frontend metadata still says "Create Next App" | `frontend/app/layout.tsx:15-18` | — |
| 19 | ✅ Done | Hardcoded `http://backend:8080` in next.config instead of env var | `frontend/next.config.ts` | #13 |
