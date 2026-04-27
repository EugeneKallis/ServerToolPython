# GEMINI.md

This file provides guidance to Antigravity when working with code in this repository.

## Project Overview

**ServerToolPython** is a full-stack web application for managing, executing, and monitoring shell commands via a streaming terminal interface. It uses a microservices architecture with a FastAPI backend, Next.js frontend, a Python agent worker, PostgreSQL, and Redis.

## Common Commands

All top-level commands are in the `Makefile`:

```bash
make dev            # Start all services with Docker Compose (development)
make run            # Run backend directly on port 8080 with auto-reload
make test           # Run backend tests
make lint           # Lint all services
make seed           # Seed database with test data
make migrate        # Apply Alembic migrations
make migration MESSAGE="description"  # Create a new Alembic migration
make build-all      # Build all Docker images
make push-all       # Push all Docker images to registry
make helm-deploy    # Deploy to Kubernetes via Helm (charts in ../kubernetes-cluster)
```

### Backend (standalone)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080

# Run a single test file
pytest tests/test_macros.py -v

# Run all tests
pytest tests/ -v
```

### Frontend (standalone)

```bash
cd frontend
npm install
npm run dev    # Development server on port 3000
npm run build  # Production build
npm run lint   # ESLint
```

## Architecture

### Execution Flow

1. Frontend calls `POST /api/macros/{id}/execute`
2. Backend publishes command JSON to Redis channel `agent_commands`
3. Agent receives, executes the shell command, and streams stdout/stderr line-by-line to Redis channel `agent_responses`
4. Backend's run-log listener aggregates agent output and writes a `ScriptRun` record to PostgreSQL
5. Backend WebSocket (`/ws/terminal`) forwards the output in real-time to connected frontend clients
6. Frontend `TerminalContext` renders output in the Terminal component

### Services

| Service  | Port | Purpose                                     |
| -------- | ---- | ------------------------------------------- |
| backend  | 8080 | FastAPI REST API + WebSocket                |
| frontend | 3000 | Next.js UI                                  |
| agent    | —    | Python worker; executes commands            |
| postgres | 5432 | Primary data store                          |
| redis    | 6379 | Pub/Sub messaging between backend and agent |

### Backend (`backend/`)

- **`app/main.py`** — FastAPI app, lifespan handler that starts the scheduler and run-log listener background task
- **`app/models.py`** — SQLAlchemy ORM models: `MacroGroup`, `Macro`, `Command`, `CommandArgument`, `ArrInstance`, `ScriptRun`, `MacroSchedule`
- **`app/schemas.py`** — Pydantic schemas for request/response validation
- **`app/routers/`** — One router per resource (`macros`, `commands`, `macro_groups`, `arr_instances`, `script_runs`, `schedules`, `agent`)
- **`app/utils/scheduler.py`** — APScheduler cron-based macro execution; loads enabled `MacroSchedule` records on startup
- **`app/database.py`** — SQLAlchemy engine and `get_db` session dependency
- **`tests/`** — pytest tests using in-memory SQLite via a test `get_db` override

### Agent (`agent/`)

- **`app/main.py`** — Single-file async worker: subscribes to `agent_commands`, executes shell commands, streams output to `agent_responses`
- **`TaskManager`** class manages a queue of pending commands and the currently running subprocess; supports `kill_current_task()` and `clear_queue()`

### Frontend (`frontend/`)

- **`app/context/TerminalContext.tsx`** — Manages the WebSocket connection to `/ws/terminal` and the list of output lines
- **`app/context/MacroContext.tsx`** — Macro data and API interactions
- **`app/page.tsx`** — Home page: terminal display
- **`app/admin/page.tsx`** — Macro/command/group management (CRUD)
- **`app/scheduler/page.tsx`** — Cron schedule management
- **`app/run-log/page.tsx`** — Execution history

### Data Model Relationships

```
MacroGroup → Macro → Command → CommandArgument
Macro → MacroSchedule
Macro → ScriptRun
```

### Redis Channels

- `agent_commands` — Backend publishes; Agent subscribes
- `agent_responses` — Agent publishes; Backend subscribes

## CI/CD

Komodo manages build and deploy pipelines. Config is in `komodo.toml`.

## Playwright / Browser Testing

When using Playwright MCP tools to take screenshots:
- Always delete screenshots after you are done with them using `rm .playwright-mcp/*.png .playwright-mcp/*.jpeg 2>/dev/null || true`
- Only keep a screenshot if you will reference it again in the same task
- Console logs in `.playwright-mcp/` can also be deleted when done

## Design System

This project uses a design system defined in `frontend/design/` (previously `stitch/` at the project root).
- `frontend/design/code.html` — full design system reference (colors, fonts, components)
- `frontend/design/screen.png` — visual reference screenshot

Always refer to these files when generating or modifying any UI component.

- Use only colors, fonts, and spacing values defined in code.html.
- Do not invent new values or use defaults from any framework.
- Match component states (hover, focus, active, disabled) to the patterns in code.html.
- Follow the typographic scale and weight assignments in code.html.

## Scraper Page Layout

The scraper page (`frontend/app/scraper/page.tsx`) uses a full-width, snap-scroll layout:
- No horizontal padding on the scroll area — cards go edge to edge
- `snap-y snap-mandatory` on the scroll container, `snap-start` + `h-full` on each card wrapper
- Each card's image uses `flex-1 min-h-0` to fill all available vertical space
- Controls (header, tabs, tags) are in a padded `shrink-0` section above the scroll area
- This pattern should be preserved when modifying the scraper page

## Memory

Always write notes, decisions, and preferences to this file (`GEMINI.md`) — never to the external auto-memory system (`~/.gemini/antigravity/`). GEMINI.md is versioned in git and loaded automatically every session.

## Git Workflow

- Always work on `develop` branch
- Only push to `develop` — never push to `main`
- User manually merges `develop` → `main` when ready
