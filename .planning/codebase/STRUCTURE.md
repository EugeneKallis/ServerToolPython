# ServerToolPython — Directory Structure & Module Breakdown

## Repository Root

```
ServerToolPython/
├── .planning/codebase/        # Codebase map (this directory)
├── .woodpecker/               # CI/CD pipeline definitions
│   ├── dev-deploy.yml         # Dev branch: build + deploy
│   └── prod-deploy.yml        # Prod branch: build + deploy
├── docker-compose.yml         # All services for local dev
├── Makefile                   # Top-level build/deploy targets
├── CLAUDE.md                  # Project instructions for Claude Code
├── backend/
├── frontend/
├── agent/
├── scraper/
├── arr_searcher/
└── magnet_bridge/
```

---

## Backend (`backend/`)

```
backend/
├── app/
│   ├── main.py            # FastAPI app, lifespan, WebSocket, background listeners
│   ├── models.py          # SQLAlchemy ORM (11 tables)
│   ├── schemas.py         # Pydantic request/response schemas
│   ├── database.py        # Engine, SessionLocal, get_db dependency
│   ├── redis_client.py    # get_redis_client() helper
│   ├── routers/
│   │   ├── macros.py          # Macro CRUD + /execute endpoint
│   │   ├── commands.py        # Command CRUD
│   │   ├── macro_groups.py    # MacroGroup CRUD
│   │   ├── arr_instances.py   # Radarr/Sonarr instance CRUD
│   │   ├── schedules.py       # MacroSchedule CRUD
│   │   ├── script_runs.py     # ScriptRun read-only history
│   │   ├── scraper.py         # Scraper control + item management
│   │   ├── agent.py           # Agent reset endpoint
│   │   └── chat.py            # Chat CRUD + PDF extraction
│   └── utils/
│       ├── arr_config.py      # Broadcast Arr config via Redis
│       └── scheduler.py       # APScheduler cron management
├── migrations/
│   └── versions/              # Alembic migration files
├── tests/
│   ├── conftest.py            # SQLite in-memory fixtures, TestClient
│   ├── test_macros.py
│   ├── test_commands.py
│   └── test_macro_groups.py
├── requirements.txt
├── Dockerfile
└── Dockerfile.dev
```

### Database Tables

| Table | Purpose |
|---|---|
| `macro_group` | Groups for organising macros |
| `macro` | Named sequence of commands |
| `command` | Single shell command string |
| `command_argument` | Optional flag for a command |
| `arr_instance` | Radarr/Sonarr connection config |
| `script_run` | Persisted execution log per macro run |
| `macro_schedule` | APScheduler cron definitions |
| `scraped_item` | Media library item from scraper |
| `scraped_item_file` | Individual file within a scraped item |
| `chat_conversation` | Chat session container |
| `chat_message` | Individual chat message |

---

## Frontend (`frontend/`)

```
frontend/
├── app/
│   ├── layout.tsx             # Root layout, sidebar, providers
│   ├── page.tsx               # Home — ChatTerminal
│   ├── admin/page.tsx         # Macro/command/group CRUD UI
│   ├── chat/page.tsx          # Dedicated chat page
│   ├── scheduler/page.tsx     # Cron schedule management
│   ├── run-log/page.tsx       # Execution history
│   ├── scraper/page.tsx       # Media library (snap-scroll cards)
│   ├── tools/arr-searcher/page.tsx
│   ├── about/page.tsx
│   ├── components/
│   │   ├── ChatTerminal.tsx       # Chat + terminal feed, Ollama streaming
│   │   ├── Terminal.tsx           # Terminal-only feed display
│   │   ├── Sidebar.tsx            # Nav + macro tree
│   │   ├── Navigation.tsx         # Top navbar
│   │   ├── Titlebar.tsx           # Page title bar
│   │   ├── MacroArgumentsModal.tsx
│   │   └── admin/
│   │       ├── AdminPanel.tsx
│   │       ├── ItemForm.tsx
│   │       └── SortableListItem.tsx
│   └── context/
│       ├── TerminalContext.tsx    # WebSocket connection, feed items
│       └── MacroContext.tsx       # Macro hierarchy, refresh
├── design/
│   ├── code.html              # Full design system reference
│   └── screen.png             # Visual reference screenshot
├── package.json
├── tailwind.config.ts
├── Dockerfile
└── Dockerfile.dev
```

---

## Agent (`agent/`)

```
agent/
├── app/
│   └── main.py        # TaskManager, execute_and_stream, command_worker, run_agent
├── scripts/           # Python utility scripts run as macros
│   ├── hello_agent.sh
│   ├── broken_link_finder.py
│   └── special_cleaner.py
├── requirements.txt
├── Dockerfile
└── Dockerfile.dev
```

### Agent Message Protocol

**Inbound on `agent_commands`:**
```json
{ "type": "execute|kill", "command": "...", "macro_name": "...", "run_id": "uuid", "is_last": true }
```

**Outbound on `agent_responses`:**
```json
{ "status": "started|streaming|completed|error|reset", "run_id": "uuid", "message": "...", "exit_code": 0 }
```

---

## Scraper (`scraper/`)

Async scraping loops for multiple sources. Pushes results to Redis list `scraper_results`. Status tracked in `scraper:status:{source}` keys.

## Arr-Searcher (`arr_searcher/`)

Radarr/Sonarr API integration. Listens for `arr_config_updates` on Redis.

## Magnet-Bridge (`magnet_bridge/`)

HTTP API service (port 8081) bridging magnet links to debrid services (Decypharr).

---

## Kubernetes Helm Charts (`/kubernetes-cluster/charts/servertool-python/`)

```
servertool-python/               # Umbrella chart
├── Chart.yaml                   # 7 sub-chart dependencies
├── values.yaml
├── values-dev.yaml
├── values-prod.yaml
├── infrastructure/              # PostgreSQL + Redis
│   └── templates/
│       ├── postgres.yaml        # 5Gi PVC, pinned to k3s-master
│       └── redis.yaml           # 1Gi PVC, AOF persistence
├── backend/
├── frontend/
│   └── templates/ingress.yaml   # dev.servertool.cluster.lan
├── agent/
│   └── templates/deployment.yaml  # Docker socket mount, privileged
├── scraper/
├── arr-searcher/
└── magnet-bridge/
    └── templates/ingress.yaml   # dev.magnetbridge.cluster.lan
```

---

## CI/CD (`.woodpecker/`)

### dev-deploy.yml flow:
1. Build 6 Docker images in parallel (tag: `dev-{COMMIT_SHA:0:8}`)
2. Push to Docker Hub (`eugenekallis/servertoolpython-*`)
3. Clone `kubernetes-cluster` repo, update `values-dev.yaml` tag via `yq`, commit + push

Triggered on push to `develop` branch.

---

## Key Naming Conventions

| Layer | Convention |
|---|---|
| DB tables | `snake_case` |
| API paths | `/api/{resource_plural}/{id}/{action}` |
| Redis channels | `snake_case` (e.g. `agent_commands`) |
| React components | `PascalCase.tsx` |
| Python functions | `snake_case` |
| Env vars | `UPPER_SNAKE_CASE` |
