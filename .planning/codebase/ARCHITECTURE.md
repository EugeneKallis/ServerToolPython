# ServerToolPython Architecture

**Last Updated:** March 28, 2026

## 1. High-Level System Design

ServerToolPython is a full-stack application for managing, executing, and monitoring commands through a real-time streaming terminal interface. The system follows a microservices architecture pattern orchestrated via Docker Compose (development) and Kubernetes/Helm (production).

### Core Services

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│                     Real-time Terminal UI                        │
│                     WebSocket Client, React Contexts             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI + Python)                     │
│                    API Routes, Database ORM                      │
│              Background Listeners & Schedulers                   │
└────────────────────────────┬────────────────────────────────────┘
         │                   │                      │
    HTTP │           Redis Pub/Sub            Database Queries
         │                   │                      │
         ▼                   ▼                      ▼
    ┌─────────┐    ┌─────────────────┐    ┌──────────────────┐
    │ Agent   │    │ Redis (Broker)  │    │ PostgreSQL 15    │
    │ Worker  │    │ Message Hub     │    │ Relational DB    │
    │ Process │    │ Pub/Sub Cache   │    │ Persistence      │
    └────┬────┘    └─────────────────┘    └──────────────────┘
         │                   ▲
         │ Redis Channel     │
         │ agent_commands    │
         └───────────────────┘
         │                   ▲
         │ Redis Channel     │
         │ agent_responses   │
         └───────────────────┘

Auxiliary Microservices:
- Scraper: Drains scraper_results queue, persists to DB
- Arr-Searcher: Integrates with media management APIs
- Magnet-Bridge: Bridges torrent/magnet functionalities
```

### Deployment Modes

**Development (Docker Compose)**
- All services containerized and orchestrated via `docker-compose.yml`
- Volume mounts for hot-reloading (frontend/backend)
- Database and Redis in same compose stack
- Isolated network for inter-service communication

**Production (Kubernetes + Helm)**
- Helm umbrella chart at `/kubernetes-cluster/charts/servertool-python/`
- Separate microservice sub-charts (backend, frontend, agent, infrastructure, scraper, arr-searcher, magnet-bridge)
- PostgreSQL and Redis as separate Kubernetes StatefulSets/Deployments with PersistentVolumeClaims
- Ingress for external access (frontend on port 443, magnet-bridge on dedicated ingress)
- Pod anti-affinity for high availability

---

## 2. Request/Response Flow: Frontend to Backend to Agent

### Flow 1: User Executes a Macro

```
Frontend
  │
  ├─ User clicks "Execute" button on Macro
  │
  └─► POST /api/macros/{id}/execute
        │ (optional: selected_arguments)
        │
        ▼
Backend Router: macros.py/execute_macro()
  │
  ├─ Fetch Macro + Commands (SQLAlchemy ORM)
  ├─ Sort commands by ord
  ├─ For each command:
  │    ├─ Append selected arguments (shlex-quoted)
  │    ├─ Publish to Redis channel "agent_commands"
  │    │   {
  │    │    "command": "...",
  │    │    "macro_name": "...",
  │    │    "run_id": uuid,
  │    │    "is_last": bool
  │    │   }
  │    └─ (async, non-blocking)
  │
  └─► Response: {"status": "triggered", "run_id": "..."}

Agent Process (Listening on agent_commands)
  │
  ├─ Receives message from Redis Pub/Sub
  ├─ Enqueues to task_manager.queue
  │
  └─► execute_and_stream()
        │
        ├─ Publish "started" status to agent_responses
        ├─ Create subprocess.run(command)
        ├─ Stream stdout/stderr line-by-line to agent_responses
        ├─ Wait for process completion (exit code)
        └─ Publish "completed"/"error" status

Backend Background Listener: run_log_listener()
  │
  ├─ Subscribes to "agent_responses" Redis channel
  ├─ Parses JSON messages
  ├─ On "started": Create ScriptRun row in DB
  ├─ On "streaming": Accumulate output lines to _active_output dict
  ├─ On "completed"/"error": Update ScriptRun (output, status, duration)
  │
  └─► Persisted to PostgreSQL

Frontend WebSocket Connection
  │
  ├─ Connected to /ws/terminal endpoint
  ├─ Backend streams agent_responses to client
  │
  └─► Terminal UI renders output in real-time
```

### Flow 2: Agent Reset

```
Frontend
  │
  └─► POST /api/agent/reset

Backend
  │
  └─► Publish {"type": "kill"} to agent_commands

Agent
  │
  ├─ Receives KILL message
  ├─ Kill current subprocess with SIGKILL
  ├─ Clear task_manager.queue
  │
  └─ Publish "reset" status to agent_responses
```

### Flow 3: Chat Interaction

```
Frontend
  │
  ├─ User submits message in chat
  │
  └─► POST /api/chat/conversations/{id}/messages
        {
          "role": "user",
          "content": "..."
        }

Backend
  │
  ├─ Create ChatMessage row
  ├─ Update conversation.updated_at
  │
  └─► Response: ChatMessageRead (persisted message)

Frontend
  │
  └─ Optionally fetch LLM response (Ollama local or remote)
```

---

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
{
  "status": "streaming|started|completed|error|reset",
  "run_id": "uuid",
  "command": "ls -la",
  "macro_name": "Deploy Script",
  "message": "output line",
  "error": "error line (if is_error)",
  "exit_code": 0,
  "is_last": true
}
```

---

## 4. WebSocket Flow

### Connection Lifecycle

```
1. Frontend Connects
   GET /ws/terminal
   ▼
   WebSocket established (readyState = OPEN)
   ▼
   Backend subscribes to "agent_responses" channel
   ▼

2. Message Stream
   Backend receives agent_responses messages
   ▼
   Backend sends data to WebSocket client via .send_text(json)
   ▼
   Frontend parses JSON and updates TerminalContext state
   ▼

3. Disconnection
   Client closes connection
   ▼
   Backend catches WebSocketDisconnect
   ▼
   Backend unsubscribes and closes Redis connection
```

### Data Structures (Frontend)

```typescript
// TerminalContext.tsx
interface AgentFeedItem {
  type: 'agent';
  id: number;           // Timestamp-based unique ID
  command?: string;     // Command being executed
  lines: string[];      // Accumulated output lines
  done: boolean;        // Execution complete?
  exitCode?: number;    // Exit code if done
}

interface SystemFeedItem {
  type: 'system';
  id: number;
  text: string;
}

type TerminalFeedItem = AgentFeedItem | SystemFeedItem;
```

---

## 5. Key Design Patterns

### Pub/Sub Pattern (Redis)

**Benefits:**
- Decouples agent from backend; multiple backends can connect to same agent
- Enables horizontal scaling of backends (all receive same messages)
- Allows persistent task queues (BRPOP with timeout=0)

**Implementation:**
- Backend publishes commands; Agent subscribes
- Agent publishes responses; Backend and WebSocket clients subscribe
- Automatic deduplication via run_id in ScriptRun table

### Background Task Listeners

Three long-running async tasks in backend lifespan:

1. **run_log_listener()** - Subscribes to agent_responses, writes ScriptRun entries
2. **arr_config_listener()** - Subscribes to arr_config_requests, broadcasts config
3. **scraper_results_listener()** - BRPOP from scraper_results list, persists items

Pattern: Each listener runs in its own asyncio Task, survives backend restarts.

### Streaming Output

**Agent:**
- Subprocess stdout/stderr captured with `readline()`
- Each line published individually to Redis
- Enables real-time display in terminal

**Backend:**
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
async def get_redis():
    r = redis.from_url(REDIS_URL)
    try:
        yield r
    finally:
        await r.aclose()

@router.post("/reset")
async def reset_agent(r: redis.Redis = Depends(get_redis)):
    ...
```

### ORM Relationships (SQLAlchemy)

- **MacroGroup** → Macro (1:Many with cascade delete)
- **Macro** → Command (1:Many with cascade delete)
- **Command** → CommandArgument (1:Many with cascade delete)
- **MacroSchedule** → Macro (Many:1 with cascade delete)
- **ChatConversation** → ChatMessage (1:Many with cascade delete)

---

## 6. Deployment Architecture

### Development (docker-compose.yml)

```yaml
Services:
  - db (PostgreSQL:15)
    - Volume: postgres_data
  
  - redis (Redis:7)
    - In-memory, no persistence by default
  
  - backend (FastAPI)
    - Port: 8080
    - Depends on: db, redis
    - Volume mounts: ./backend for hot-reload
    - Environment: DATABASE_URL, REDIS_URL, OLLAMA_HOST
  
  - frontend (Next.js)
    - Port: 3000
    - Depends on: backend
    - Volume mounts: ./frontend, frontend_node_modules
  
  - agent
    - No exposed port (internal only)
    - Depends on: redis
  
  - scraper
    - No exposed port
    - Depends on: redis

  - magnet_bridge
    - Port: 8081 (optional external bridge)
    - Environment: DECYPHARR_URL, TORRENT_DEST_DIR

Network: Single bridge network (default)
```

### Production (Kubernetes Helm)

**Helm Chart Structure:**
```
kubernetes-cluster/charts/servertool-python/
├── Chart.yaml (umbrella, depends on 7 sub-charts)
├── values-dev.yaml
├── values-prod.yaml
│
├── infrastructure/ (PostgreSQL + Redis)
│   ├── Chart.yaml
│   ├── values.yaml, values-dev.yaml, values-prod.yaml
│   └── templates/
│       ├── postgres.yaml (Deployment + Service + PVC)
│       └── redis.yaml (Deployment + Service + PVC)
│
├── backend/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/deployment.yaml
│       - Replicas: 2-3 (configurable)
│       - Pod anti-affinity: prefers different nodes
│       - Environment: DATABASE_URL, REDIS_URL, OLLAMA_HOST
│       - Image pull policy: Always
│
├── frontend/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       └── ingress.yaml (dev.servertool.cluster.lan)
│
├── agent/
│   ├── Chart.yaml
│   └── templates/deployment.yaml
│       - Single replica (stateful listener)
│       - Depends on: redis Service
│
├── scraper/
│   ├── Chart.yaml
│   └── templates/deployment.yaml
│
├── arr-searcher/
│   └── templates/deployment.yaml
│
└── magnet-bridge/
    ├── templates/
    │   ├── deployment.yaml
    │   ├── ingress.yaml (dev.magnetbridge.cluster.lan)
    │   └── service.yaml
    └── values.yaml
```

**Global Configuration (values-dev.yaml):**
```yaml
global:
  environment: "Development"
  image:
    tag: "dev-48c94918"  # Updated by CI/CD
  ollamaHost: "http://192.168.1.125:11434"
  databaseUrl: "postgresql://postgres:postgres@db:5432/postgres"
  redisUrl: "redis://redis:6379/0"
  postgresPassword: "postgres"
```

**Persistent Storage:**
- PostgreSQL: 5Gi PVC (mounted on k3s-master node)
- Redis: 1Gi PVC with AOF persistence enabled

**Ingress:**
- Frontend ingress at `dev.servertool.cluster.lan` → backend:8080
- Magnet-Bridge ingress at `dev.magnetbridge.cluster.lan` → magnet-bridge:8081

---

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

---

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

---

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

---

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

---

## 11. Future Improvements

1. **Event Sourcing**: Replace direct DB writes with event log for audit trail
2. **Distributed Tracing**: Add OpenTelemetry for request tracing across services
3. **Rate Limiting**: Add API rate limiting on backend endpoints
4. **API Versioning**: Version frontend API calls for backward compatibility
5. **Multi-Agent Support**: Partition Redis topics per agent (agent-1_commands, agent-1_responses)
6. **Agent Load Balancing**: Multiple agents in round-robin mode
7. **Output Storage**: Move large ScriptRun outputs to object storage (S3)
8. **WebSocket Compression**: Reduce bandwidth for large outputs

