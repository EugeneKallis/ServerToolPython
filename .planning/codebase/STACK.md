# Tech Stack & Runtime Environments

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

**Backend (Python) - requirements.txt:**
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

**Backend App Main Entry:** `backend/app/main.py` (runs via `uvicorn app.main:app --host 0.0.0.0 --port 8080`)

### Frontend Framework

**Next.js & React Stack (frontend/package.json):**
- next: ^15.1.6
- react: 19.2.3
- react-dom: 19.2.3
- TypeScript: ^5
- TailwindCSS: ^4 (with @tailwindcss/postcss ^4)
- ESLint: ^9 with eslint-config-next

**UI/UX Libraries:**
- lucide-react: ^0.577.0 (icon library)
- @dnd-kit/core: ^6.3.1 (drag-and-drop)
- @dnd-kit/sortable: ^10.0.0
- @dnd-kit/utilities: ^3.2.2
- @ducanh2912/next-pwa: ^10.2.9 (Progressive Web App support)

**Frontend Entry:** Next.js app built with `npm run build` and started with `npm start` or `next dev`

## Microservices & Worker Services

### Agent Service (Python)
**Location:** `agent/`
**Runtime:** Python 3.11
**Dependencies:** requirements.txt (minimal: redis, asyncio, watchdog)
**Entry Point:** `python app/main.py`
**Port:** Not exposed (internal communication via Redis)
**Key Function:** Executes shell commands asynchronously, streams output to Redis pub/sub (`agent_responses` channel)

### Scraper Service (Python)
**Location:** `scraper/`
**Runtime:** Python 3.11
**Dependencies:**
- redis>=5.0.0
- requests

**Entry Point:** `python app/main.py`

### Magnet Bridge Service (Python)
**Location:** `magnet_bridge/`
**Runtime:** Python 3.11
**Dependencies:**
- fastapi==0.104.1
- uvicorn==0.24.0
- httpx==0.25.1
- python-multipart==0.0.6
- python-dotenv==1.0.0

**Entry Point:** `uvicorn app.main:app --host 0.0.0.0 --port 8081`
**Port:** 8081 (exposed)
**Key Function:** Bridges between magnet links and Decypharr (debrid service), manages torrent lifecycle and symlinks

## Databases & Caches

### PostgreSQL
- **Version**: 15 (from docker-compose.yml)
- **Image**: `postgres:15`
- **Port**: 5432 (exposed for dev)
- **Purpose**: Primary relational database for application state
  - Macro definitions and command structures
  - Script run history and execution logs
  - Chat conversations and messages
  - Scraped item metadata
  - Arr instance configurations
  - Macro group definitions

**Connection:** Via SQLAlchemy ORM using `DATABASE_URL` environment variable
**Migrations:** Managed via Alembic

### Redis
- **Version**: 7 (from docker-compose.yml)
- **Image**: `redis:7`
- **Port**: 6379 (exposed for dev)
- **Purpose**: Message broker and real-time communication
  - Pub/Sub channels for microservice communication
  - Task queues for agent commands, scraper commands, arr commands
  - Status tracking and caching
  - Run-log listener subscriptions

**Channels/Queues:**
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
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme
POSTGRES_DB=postgres
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
REDIS_URL=redis://redis:6379/0
OLLAMA_HOST=http://localhost:11434
```

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
  - `/api/v3/movie` (Radarr)
  - `/api/v3/series` (Sonarr)
  - `/api/v3/episode` (Sonarr)
  - `/api/v3/command` (both)
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

**Architectural Pattern**: Microservices with distributed message-driven communication via Redis

**Core Stack**:
- **Backend**: FastAPI 0.104.1+ on Python 3.11 with PostgreSQL 15 and Redis 7
- **Frontend**: Next.js 15.1.6 with React 19.2.3 and TailwindCSS 4 on Node.js 20
- **Microservices**: Python 3.11-based services (Agent, Scraper, Arr Searcher, Magnet Bridge)
- **Communication**: Redis pub/sub for async messaging, HTTP for external service calls, WebSocket for real-time terminal updates
- **Containerization**: Docker Compose with volume-mounted development environments
