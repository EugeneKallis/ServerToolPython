# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
make helm-deploy    # Deploy to Kubernetes via Helm
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

- Use only colors, fonts, and spacing values defined in design.md.
- Do not invent new values or use defaults from any framework.
- Match component states (hover, focus, active, disabled) to the patterns in design.md.
- Follow the typographic scale and weight assignments in design.md.

## Scraper Page Layout

The scraper page (`frontend/app/scraper/page.tsx`) uses a full-width, snap-scroll layout:
- No horizontal padding on the scroll area — cards go edge to edge
- `snap-y snap-mandatory` on the scroll container, `snap-start` + `h-full` on each card wrapper
- Each card's image uses `flex-1 min-h-0` to fill all available vertical space
- Controls (header, tabs, tags) are in a padded `shrink-0` section above the scroll area
- This pattern should be preserved when modifying the scraper page

## Memory

Always write notes, decisions, and preferences to this file (`CLAUDE.md`) — never to the external auto-memory system (`~/.claude/projects/.../memory/`). CLAUDE.md is versioned in git and loaded automatically every session.

## Git Workflow

- Always work on `develop` branch
- Only push to `develop` — never push to `main`
- User manually merges `develop` → `main` when ready

<!-- GSD:project-start source:PROJECT.md -->
## Project

**ServerToolPython**

ServerToolPython is a full-stack web application for managing, executing, and monitoring shell commands via a real-time streaming terminal interface. It uses a microservices architecture with a FastAPI backend, Next.js frontend, Python agent workers, PostgreSQL, and Redis. Users interact with a chat-terminal UI on the home page, executing macros that are dispatched to agent containers via Redis.

**Core Value:** Commands dispatched from the UI must execute reliably on agent containers and stream output back in real time.

### Constraints

- **Tech Stack**: FastAPI backend, Next.js/Tailwind frontend, Redis for all agent coordination — no new infrastructure
- **Design System**: Must use colors/fonts from `frontend/design/code.html` — no invented values
- **Agent Compatibility**: Heartbeat must not interfere with existing command execution (BRPOP loop runs concurrently)
- **Deployment**: Works with existing Docker Compose (dev) and Kubernetes/Helm (prod) — no chart changes required for heartbeat env vars
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages & Runtime Versions
### Python
- **Version**: 3.11 (specified in all Dockerfiles)
- **Runtime**: CPython via official `python:3.11-slim` base image
- **Async Runtime**: asyncio (built-in)
### JavaScript/TypeScript
- **Node.js Version**: 20 (specified in frontend Dockerfile: `node:20-alpine`)
- **React Version**: 19.2.3
- **TypeScript Version**: ^5
## Backend Framework & Dependencies
### FastAPI Ecosystem (Backend)
- fastapi (no pinned version, latest)
- uvicorn[standard] (no pinned version, latest)
- pytest
- httpx
- sqlalchemy
- alembic
- psycopg2-binary
- redis
- websockets
- apscheduler
- pypdf
- python-multipart
### Frontend Framework
- next: ^15.1.6
- react: 19.2.3
- react-dom: 19.2.3
- TypeScript: ^5
- TailwindCSS: ^4 (with @tailwindcss/postcss ^4)
- ESLint: ^9 with eslint-config-next
- lucide-react: ^0.577.0 (icon library)
- @dnd-kit/core: ^6.3.1 (drag-and-drop)
- @dnd-kit/sortable: ^10.0.0
- @dnd-kit/utilities: ^3.2.2
- @ducanh2912/next-pwa: ^10.2.9 (Progressive Web App support)
## Microservices & Worker Services
### Agent Service (Python)
### Scraper Service (Python)
- requests==2.32.3
- cloudscraper==1.2.71
- beautifulsoup4==4.12.3
- lxml==5.3.0
- redis==5.2.1
### Arr Searcher Service (Python)
- redis>=5.0.0
- requests
### Magnet Bridge Service (Python)
- fastapi==0.104.1
- uvicorn==0.24.0
- httpx==0.25.1
- python-multipart==0.0.6
- python-dotenv==1.0.0
## Databases & Caches
### PostgreSQL
- **Version**: 15 (from docker-compose.yml)
- **Image**: `postgres:15`
- **Port**: 5432 (exposed for dev)
- **Purpose**: Primary relational database for application state
### Redis
- **Version**: 7 (from docker-compose.yml)
- **Image**: `redis:7`
- **Port**: 6379 (exposed for dev)
- **Purpose**: Message broker and real-time communication
- `agent_commands` - commands sent to agent executor
- `agent_responses` - streaming output from agent execution
- `scraper_commands` - commands to trigger scrapes
- `scraper_results` - results from scraper service (LPUSH/BRPOP queue)
- `arr_commands` - commands to arr searcher service
- `arr_config_requests` - configuration sync requests from microservices
- `arr_config_updates` - configuration broadcasts to microservices
## Build Tools & Development
### Docker
- **Compose Version**: 3.8
- **Strategy**: Multi-stage builds for production (frontend), development mounts with live reload for all services
- **Dev Dockerfiles**: `Dockerfile.dev` in each service directory (hot-reload via volume mounts)
- **Prod Dockerfiles**: `Dockerfile` in each service directory (production-optimized)
### npm/Node Build System
- **Package Manager**: npm (implied from package-lock.json)
- **Dev Commands**: `npm run dev` (Next.js dev server)
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Linting**: `eslint`
### Python Build System
- **Package Manager**: pip
- **Setup:** `backend/setup.py` defines package metadata and dependencies
- **Installation Mode (Dev):** Editable install (`pip install -e .`) for development
- **Installation Mode (Prod):** Direct install (`pip install --no-cache-dir -r requirements.txt`)
## Testing & Quality Assurance
### Python Testing
- **Framework**: pytest (in requirements.txt)
- **HTTP Client for Tests**: httpx
### Linting & Code Quality
- **JavaScript/TypeScript**: ESLint 9 with Next.js config
## Additional Tools & Utilities
### Python Utilities
- **APScheduler**: Job scheduling library for scheduled tasks
- **PyPDF**: PDF processing capabilities
- **python-multipart**: Form data handling for FastAPI
- **alembic**: Database migration tool
- **sqlalchemy**: ORM for database interactions
- **BeautifulSoup4 + lxml**: HTML/XML parsing for web scraping
- **cloudscraper**: Anti-bot bypass library for web scraping
- **httpx**: Async HTTP client for microservices
- **websockets**: WebSocket support (FastAPI built-in via Starlette)
### Development Tools
- **Makefile**: Build automation (present in root directory)
- **Playwright**: Browser automation (indicated by `.playwright-mcp/` directory)
## Environment Configuration
### Environment Variables (from .env.example)
### Service-Specific Environment Variables
- **Backend**: DATABASE_URL, REDIS_URL, OLLAMA_HOST, PYTHONDONTWRITEBYTECODE, PYTHONUNBUFFERED, TZ=America/New_York
- **Frontend**: NEXT_PUBLIC_API_URL=/api, WATCHPACK_POLLING=true
- **Agent**: REDIS_URL
- **Scraper**: REDIS_URL
- **Arr Searcher**: REDIS_URL
- **Magnet Bridge**: DECYPHARR_URL, TORRENT_DEST_DIR, MAGNET_BRIDGE_PORT
## External Service Integrations
### Ollama (LLM)
- **Connection**: HTTP
- **Default Host**: http://localhost:11434
- **Purpose**: Local LLM inference (referenced in backend config endpoint)
- **Configuration**: OLLAMA_HOST environment variable
### Decypharr (Debrid Service)
- **Connection**: HTTP
- **Default URL**: http://192.168.1.99:8282
- **API Endpoint**: `/api/torrents`
- **Purpose**: Torrent debridding and status queries
- **Used By**: Magnet Bridge service
### Arr Instances (Radarr/Sonarr)
- **Connection**: HTTP with API Key authentication
- **Headers**: X-Api-Key (API key header), Content-Type: application/json
- **Base Endpoints**: 
- **Used By**: Arr Searcher service for missing content detection and search triggering
### Magnet Bridge External Service
- **URL**: http://magnet-bridge:8081/api
- **Environment Variable**: MAGNET_BRIDGE_URL
- **Used By**: Frontend scraper page for bridge operations
## Port Mapping (docker-compose.yml)
| Service | Container Port | Host Port | Purpose |
|---------|----------------|-----------|---------|
| PostgreSQL | 5432 | 5432 | Database access (dev only) |
| Redis | 6379 | 6379 | Message broker (dev only) |
| Backend | 8080 | 8080 | FastAPI REST/WebSocket server |
| Frontend | 3000 | 3000 | Next.js dev/prod server |
| Magnet Bridge | 8081 | 8081 | Magnet bridge REST API |
## Summary
- **Backend**: FastAPI 0.104.1+ on Python 3.11 with PostgreSQL 15 and Redis 7
- **Frontend**: Next.js 15.1.6 with React 19.2.3 and TailwindCSS 4 on Node.js 20
- **Microservices**: Python 3.11-based services (Agent, Scraper, Arr Searcher, Magnet Bridge)
- **Communication**: Redis pub/sub for async messaging, HTTP for external service calls, WebSocket for real-time terminal updates
- **Containerization**: Docker Compose with volume-mounted development environments
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Python Backend Conventions
### Code Organization
- **Module structure**: `backend/app/` follows a feature-based organization
### Naming Conventions
- **Models**: PascalCase for class names (e.g., `MacroGroup`, `Command`, `ScriptRun`)
- **Database tables**: snake_case (e.g., `macro_group`, `command_argument`, `script_run`)
- **Functions**: snake_case (e.g., `create_macro`, `get_macros`, `update_macro`)
- **Route prefixes**: plural kebab-case or snake_case (e.g., `/macros`, `/macro-groups`, `/arr-instances`)
- **Path parameters**: snake_case IDs (e.g., `/{id}`, `/{arg_id}`)
### Database Patterns
#### SQLAlchemy Conventions
- Use declarative base with `DeclarativeBase` and metadata naming convention:
- Use `Mapped` type hints for all columns (modern SQLAlchemy 2.0+ style)
- Use `mapped_column()` with explicit type annotations
- Use `relationship()` with `back_populates` for bidirectional relationships
- Use `cascade="all, delete-orphan"` for child relationships to ensure data integrity
#### Alembic Migration Pattern
- Migrations are auto-generated with `alembic revision --autogenerate -m "description"`
- Migration files follow naming: `{revision_id}_{description}.py`
- Located in `backend/migrations/versions/`
- Always use `upgrade()` and `downgrade()` functions
### API Router Patterns
#### Standard CRUD Endpoints
#### Error Handling
- Use `HTTPException(status_code=404, detail="Resource not found")` for not-found errors
- Use `HTTPException(status_code=500, detail="Error message")` for server errors
- Return error message strings in `detail` field
#### Partial Updates Pattern
### Pydantic Schema Patterns
#### Three-Variant Schema Pattern
### Session & Dependency Injection
- Use `get_session()` dependency to inject database session into route handlers
- Session is yielded and automatically closed in finally block
- In tests, override `get_session` with in-memory test session
## TypeScript/React Frontend Conventions
### Project Structure
- **`app/`** — Next.js App Router pages and layouts
- **`app/components/`** — Reusable React components
- **`app/context/`** — React Context providers (TerminalContext, MacroContext)
- **`app/[feature]/page.tsx`** — Route-specific pages (admin, scheduler, chat, scraper, etc.)
- **`design/`** — Design system reference (colors, typography, components)
### Component Patterns
#### Functional Components with 'use client'
#### Component Props Pattern
### Context Usage
#### Provider Pattern
#### Root Layout Integration
### State Management
- **Simple state**: `useState` for local component state
- **Shared state**: React Context for cross-component data
- **Async data**: Custom hooks that manage fetch state internally
- **WebSocket**: Context manages connection lifecycle (onopen, onmessage, onerror)
### Styling Conventions
#### Tailwind Classes
- Use design system color tokens: `bg-surface`, `text-on-surface`, `border-outline-variant`
- Use spacing scale: gap, p, m with standard values
- Use flexbox utilities for layout: `flex`, `flex-col`, `items-center`, `justify-between`
- State variants: `hover:`, `focus:`, `disabled:`, `animate-` prefixes
#### Class Organization Pattern
#### Responsive Design
- Use `lg:` prefix for larger screens (e.g., `lg:p-6`)
- Mobile-first approach (no prefix = mobile, `lg:` = desktop)
### Naming Conventions
- **Components**: PascalCase file names and export names (e.g., `Terminal.tsx`)
- **Contexts**: PascalCase with "Context" suffix (e.g., `TerminalContext.tsx`)
- **Hooks**: camelCase with "use" prefix (e.g., `useTerminal`)
- **Types/Interfaces**: PascalCase (e.g., `TerminalContextType`, `TerminalFeedItem`)
## API Design Conventions
### URL Patterns
- **Resource endpoints**: `/api/{resource}` (plural, kebab-case or snake_case)
- **Single resource**: `/api/{resource}/{id}`
- **Nested resources**: `/api/{parent}/{id}/{child}` (e.g., `/api/commands/{id}/arguments`)
- **Actions**: `/api/{resource}/{id}/action` (e.g., `/api/macros/{id}/execute`)
- **WebSocket**: `/ws/terminal`
### HTTP Methods
- `POST` — Create new resource
- `GET` — Read resource(s)
- `PATCH` — Partial update (not PUT)
- `DELETE` — Remove resource
### Response Format
#### Success Responses
- **Single resource**: Return the resource object directly
- **List**: Return array of resource objects
- **Action result**: Return object with status message or result
#### Error Responses
- Use `HTTPException` with `status_code` and `detail` fields
- Always include a `detail` string describing the error
- Standard codes: 404 (not found), 500 (server error), 400 (bad request)
### WebSocket Messaging Format
## Design System Rules
### Colors
- **Primary**: `primary`, `on-primary`, `primary-container`, `on-primary-container`, `primary-fixed`, `primary-fixed-dim`, `on-primary-fixed`, `on-primary-fixed-variant`
- **Secondary**: `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container`, `secondary-fixed`, `secondary-fixed-dim`
- **Tertiary**: `tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container`, `tertiary-fixed`, `tertiary-fixed-dim`
- **Error**: `error`, `on-error`, `error-container`, `on-error-container`
- **Surface variants**: `surface`, `surface-dim`, `surface-bright`, `surface-container`, `surface-container-low`, `surface-container-high`, `surface-container-highest`, `surface-container-lowest`
- **Text**: `on-surface`, `on-surface-variant`, `on-background`
- **Outline**: `outline`, `outline-variant`
### Typography
- **Headline**: Space Grotesk (font-headline) — titles and headers
- **Body**: Inter (font-body) — main text
- **Label**: Space Grotesk (font-label) — labels and captions
- **Monospace**: JetBrains Mono (font-mono) — code, terminal output
### Special Components
- **Glass panel**: `.glass-panel { background: rgba(53, 53, 52, 0.6); backdrop-filter: blur(20px); }`
- **Kinetic gradient**: `.kinetic-gradient { background: linear-gradient(90deg, #00E38A 0%, #00FF9C 100%); }`
### Layout Patterns
- **Terminal**: `flex flex-col h-full bg-surface-container-lowest overflow-hidden border border-outline-variant`
- **Header**: `flex items-center px-4 py-2 bg-surface-container-low border-b border-outline-variant`
- **Content area**: `flex-1 p-4 overflow-y-auto`
## Docker & Deployment Conventions
### Service Configuration
- **Backend**: Python 3.11-slim, Uvicorn on port 8080
- **Frontend**: Node 20-alpine, Next.js on port 3000 (multi-stage build)
- **Agent**: Python-based worker (no exposed port)
- **Database**: PostgreSQL 15 on port 5432
- **Cache**: Redis 7 on port 6379
### Docker Compose Patterns
- Development images use `Dockerfile.dev` for live reload
- Production images use `Dockerfile` (multi-stage builds for frontend)
- Volumes mount source code for hot-reload in dev
- Environment variables passed via .env file
- Service dependencies declared with `depends_on`
### Build System
- Makefile targets: `make dev`, `make run`, `make test`, `make build-all`, `make push-all`
- Docker images tagged: `eugenekallis/servertoolpython-{service}:{VERSION}`
- Build command: `docker build --platform linux/amd64 -t IMAGE:TAG`
### CI/CD Pipeline (Komodo)
- **Trigger**: On push to `develop` branch or manual trigger
- **Steps**: Build and push each service separately (backend, frontend, agent, magnet-bridge)
- **Images**: Use `docker-builder` with host socket mounting
- **Secrets**: Docker credentials from Komodo secret store
### Kubernetes Deployment
- Helm charts in `../kubernetes-cluster/charts/servertool-python`
- Deploy command: `make helm-deploy`
## Git Workflow
### Branch Conventions
- **Main branch**: `main` — production code only
- **Development branch**: `develop` — active development, pull requests merge here
- Always work on `develop`, never directly on `main`
- User manually merges `develop` → `main` when ready for release
### Commit Message Format
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — build, dependencies, tooling
- `docs:` — documentation updates
- `refactor:` — code refactoring without behavior change
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## 1. High-Level System Design
### Core Services
```
- Scraper: Drains scraper_results queue, persists to DB
- Magnet-Bridge: Bridges torrent/magnet functionalities
```
### Deployment Modes
- All services containerized and orchestrated via `docker-compose.yml`
- Volume mounts for hot-reloading (frontend/backend)
- Database and Redis in same compose stack
- Isolated network for inter-service communication
- Helm umbrella chart at `/kubernetes-cluster/charts/servertool-python/`
- Separate microservice sub-charts (backend, frontend, agent, infrastructure, scraper, arr-searcher, magnet-bridge)
- PostgreSQL and Redis as separate Kubernetes StatefulSets/Deployments with PersistentVolumeClaims
- Ingress for external access (frontend on port 443, magnet-bridge on dedicated ingress)
- Pod anti-affinity for high availability
## 2. Request/Response Flow: Frontend to Backend to Agent
### Flow 1: User Executes a Macro
```
```
### Flow 2: Agent Reset
```
```
### Flow 3: Chat Interaction
```
```
## 3. Data Flow Through Redis Pub/Sub
### Redis Channels
| Channel | Publisher | Subscriber | Message Type | Purpose |
|---------|-----------|-----------|--------------|---------|
| `agent_commands` | Backend (macros.py, scheduler) | Agent | JSON command object | Send commands to execute |
| `agent_responses` | Agent | Backend (run_log_listener) | JSON status + output | Stream execution results |
| `arr_config_requests` | Microservices (magnet_bridge) | Backend (arr_config_listener) | Trigger | Request Arr config broadcast |
| `arr_config_updates` | Backend | Microservices | JSON Arr instances | Share config updates |
| `scraper_results` | Scraper (LPUSH to list) | Backend (BRPOP from list) | JSON items | Persist scraped content |
### Redis Key Patterns
- **Scraper Status**: `scraper:status:{source}` → "0" or "1"
- **Session State**: Various temporary caching (depends on microservice needs)
### Message Format Example (agent_responses)
```json
```
## 4. WebSocket Flow
### Connection Lifecycle
```
```
### Data Structures (Frontend)
```typescript
```
## 5. Key Design Patterns
### Pub/Sub Pattern (Redis)
- Decouples agent from backend; multiple backends can connect to same agent
- Enables horizontal scaling of backends (all receive same messages)
- Allows persistent task queues (BRPOP with timeout=0)
- Backend publishes commands; Agent subscribes
- Agent publishes responses; Backend and WebSocket clients subscribe
- Automatic deduplication via run_id in ScriptRun table
### Background Task Listeners
### Streaming Output
- Subprocess stdout/stderr captured with `readline()`
- Each line published individually to Redis
- Enables real-time display in terminal
- Accumulates output in memory dict (_active_output)
- Flushes to DB on completion
- Handles multiple commands per macro run (is_last flag)
### Scheduler (APScheduler)
- Cron-based macro execution triggered from backend
- Loaded on startup from MacroSchedule table
- Publishes to agent_commands same as manual execution
- Timezone-aware (default: America/New_York)
### Dependency Injection (FastAPI)
```python
```
### ORM Relationships (SQLAlchemy)
- **MacroGroup** → Macro (1:Many with cascade delete)
- **Macro** → Command (1:Many with cascade delete)
- **Command** → CommandArgument (1:Many with cascade delete)
- **MacroSchedule** → Macro (Many:1 with cascade delete)
- **ChatConversation** → ChatMessage (1:Many with cascade delete)
## 6. Deployment Architecture
### Development (docker-compose.yml)
```yaml
```
### Production (Kubernetes Helm)
```
```
```yaml
```
- PostgreSQL: 5Gi PVC (mounted on k3s-master node)
- Redis: 1Gi PVC with AOF persistence enabled
- Frontend ingress at `dev.servertool.cluster.lan` → backend:8080
- Magnet-Bridge ingress at `dev.magnetbridge.cluster.lan` → magnet-bridge:8081
### CI/CD Pipeline (Komodo)
- Build and push each service separately (backend, frontend, agent, magnet-bridge)
## 7. Technology Stack
### Backend
- **Framework**: FastAPI (async Python web framework)
- **ORM**: SQLAlchemy (with async support for Redis)
- **Database**: PostgreSQL 15
- **Message Broker**: Redis 7 (Pub/Sub + optional persistence)
- **Task Scheduler**: APScheduler (cron-based)
- **Server**: Uvicorn (ASGI)
- **Testing**: pytest, httpx
- **Other**: websockets, alembic (migrations), pypdf (PDF extraction)
### Frontend
- **Framework**: Next.js 15 (React 19)
- **Styling**: Tailwind CSS 4
- **UI Icons**: Lucide React
- **Drag & Drop**: @dnd-kit (sortable lists)
- **PWA**: @ducanh2912/next-pwa
- **Build Tool**: TypeScript, ESLint
### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Kubernetes (k3s on premise)
- **Package Manager**: Helm
- **CI/CD**: Komodo
- **Container Registry**: Docker Hub (eugenekallis/)
## 8. Security & Scaling Considerations
### Security
- **Command Injection Prevention**: Arguments are shell-quoted via `shlex.quote()`
- **Secret Management**: Sensitive env vars (DB password, API keys) via Kubernetes Secrets / Komodo Secrets
- **WebSocket**: Same-origin policy; frontend and backend on same origin
- **Database**: PostgreSQL with strong passwords in production
### Scaling Patterns
- **Horizontal Scaling**: Multiple backend instances via Kubernetes replicas (load-balanced by Kubernetes service)
- **Agent Bottleneck**: Single agent per Redis instance (one command execution at a time, queued)
- **Database**: PostgreSQL scales vertically; consider read replicas for query-heavy features
- **Redis**: Single instance with AOF persistence; can upgrade to Redis Cluster for HA
- **Frontend**: Stateless Next.js instances (scale via Kubernetes replicas)
## 9. Exception Handling & Resilience
### Backend Resilience
- **Database Connection Retry**: `wait_for_db()` retries up to 10 times on startup
- **Redis Connection Error Handling**: Try/finally blocks ensure cleanup
- **Background Task Error Handling**: Each listener has try/except to prevent cascade failures
- **Duplicate Prevention**: run_id uniqueness in ScriptRun table handles agent/backend restart scenarios
### Agent Resilience
- **Task Queue**: Commands queued in asyncio.Queue, survives temporary disconnections
- **Process Cleanup**: SIGKILL on reset ensures no orphaned processes
- **Graceful Shutdown**: On signal, cancel listener task and exit cleanly
### Frontend Resilience
- **WebSocket Reconnection**: Manual reconnect logic on disconnect (TerminalContext)
- **State Persistence**: Uses React state; local storage not implemented (could be added)
## 10. Data Persistence Strategy
| Data | Storage | Backup/HA | Notes |
|------|---------|-----------|-------|
| Macros, Commands | PostgreSQL | Nightly dumps (recommended) | Source of truth |
| ScriptRuns (logs) | PostgreSQL | Included in dumps | Immutable once completed |
| Chat Conversations | PostgreSQL | Included in dumps | Audit trail |
| Scraped Items | PostgreSQL | Included in dumps | Media library |
| Arr Instances | PostgreSQL | Included in dumps | Configuration |
| Cron Schedules | PostgreSQL | Included in dumps | Job definitions |
| In-Flight Command Output | Redis (memory) | Not persisted | Ephemeral, flushed to DB on completion |
| Agent Status | Redis key | Not persisted | Temporary flags |
## 11. Future Improvements
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
