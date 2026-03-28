# ServerToolPython: Concerns & Risks

**Date:** 2026-03-28  
**Scope:** Full-stack application with FastAPI backend, Next.js frontend, Python agent worker, PostgreSQL, and Redis.

---

## Critical Security Concerns

### 1. Shell Command Injection Risk (Agent)
**File:** `/agent/app/main.py`, lines 50-55  
**Issue:** The agent executes shell commands directly via `asyncio.create_subprocess_shell()` without input validation or sanitization. While the backend does apply `shlex.quote()` for optional arguments in `/backend/app/routers/macros.py` (line 99), the base command itself is passed unsanitized.

**Risk:** An attacker who can create or modify macro commands in the database can execute arbitrary shell commands with the agent's privileges.

**Current State:**
- Commands come from the database (SQL injection would be required first)
- No validation of command content before execution
- No allowlist/denylist of permitted commands
- No rate limiting per macro

**Mitigation Needed:**
- Command validation/sanitization before execution
- Consider allowlist approach for permitted commands
- Add command execution auditing

---

### 2. Missing Authentication & Authorization
**Files:** All FastAPI routers in `/backend/app/routers/`  
**Issue:** No authentication or authorization checks on any API endpoints. Any unauthenticated user can:
- Create, read, update, delete macros and commands
- Execute arbitrary macros
- Modify schedules
- Kill running tasks
- Access chat conversations and PDFs
- Manage arr_instances with API credentials

**Example:** 
```python
@router.post("/{id}/execute")
async def execute_macro(id: int, payload: Optional[ExecuteMacroPayload] = None, ...):
    # No auth check — anyone can execute any macro
```

**Risk:** Unauthorized macro execution, data theft, system compromise.

**Status:** Critical gap in production readiness.

---

### 3. API Keys Stored in Plain Text
**File:** `/backend/app/models.py`, line 76  
**Issue:** Radarr/Sonarr API keys are stored in the `ArrInstance` model as plain `String` without encryption:
```python
api_key: Mapped[str] = mapped_column(String)
```

**Risk:** If the database is compromised (SQL injection, backup theft), all API keys are exposed.

**Impact:** Full access to Radarr/Sonarr APIs.

**Mitigation Needed:**
- Encrypt API keys at rest (e.g., using `cryptography.Fernet`)
- Use secrets management (e.g., HashiCorp Vault, AWS Secrets Manager)

---

### 4. Exposed Docker Socket
**File:** `/docker-compose.yml`, line 62  
**Issue:** Docker socket is mounted directly into the agent container:
```yaml
- /var/run/docker.sock:/var/run/docker.sock
```

**Risk:** Any process in the agent container can run arbitrary Docker commands, including creating privileged containers or accessing host filesystem.

**Current Usage:** Allows macros to run docker commands.

**Mitigation:**
- Evaluate whether this access is truly needed
- If yes, use a restricted Docker proxy (e.g., `socket-proxy`)
- Consider running agent without Docker socket in production

---

### 5. Unencrypted Redis Communication
**File:** Multiple files using `redis.from_url()` pattern  
**Issue:** Redis connection strings default to unencrypted `redis://` protocol. No TLS/SSL enforcement.

**Risk:** If Redis is exposed or on an untrusted network, pub/sub messages (including commands and outputs) can be intercepted.

**Example:** `/backend/app/main.py`, line 29; `/agent/app/main.py`, line 115

**Mitigation:** Enforce `rediss://` (Redis over TLS) in production.

---

## Technical Debt

### 1. Incomplete Scheduler Argument Application
**File:** `/backend/app/utils/scheduler.py`, lines 43-45  
**Issue:** The scheduler loads selected arguments from `MacroSchedule.args` but does not apply them:
```python
selected_args = json.loads(schedule.args) if schedule.args else {}
# ... later ...
if selected_args:
    pass  # <- No-op!
```

Scheduled macros run with base commands only, even if arguments are configured.

**Impact:** Scheduled execution differs from manual execution.

**Status:** Feature incomplete but not critical.

---

### 2. Hardcoded Default Values Repeated Throughout Codebase
**Issue:** `redis://redis:6379/0` is repeated in 10+ locations instead of being centralized:
- `/backend/app/main.py` (lines 29, 123, 151, 317)
- `/backend/app/redis_client.py` (line 5 uses different default: `redis://localhost:6379/0`)
- `/agent/app/main.py` (line 115)
- `/backend/app/routers/agent.py` (line 8)
- And more...

**Issue 2:** Inconsistent default for Redis client in `/backend/app/redis_client.py` uses `localhost:6379` while all others use `redis:6379` (Docker service name).

**Impact:** Configuration drift, maintenance burden, inconsistent behavior.

**Mitigation:** Create a central config module with environment variables and defaults.

---

### 3. No Logging Infrastructure
**Files:** All modules  
**Issue:** Application uses `print()` statements for logging instead of a proper logging framework:
```python
print("Agent starting, connecting to Redis...", flush=True)
print(f"Error processing message: {e}", flush=True)
```

**Problems:**
- No log levels (info/warning/error)
- No structured logging for parsing/monitoring
- No log rotation or management
- Print statements disappear in background tasks
- No request tracing

**Impact:** Difficult debugging, poor observability in production.

**Mitigation:** Use Python's `logging` module with structured logging (JSON).

---

### 4. No Health Checks or Readiness Probes
**Files:** `/backend/app/main.py`, `/agent/app/main.py`  
**Issue:** 
- Backend has a `/` endpoint that reports status but doesn't check Redis availability thoroughly
- Agent has no health check endpoint
- No Kubernetes-style liveness/readiness probes

**Impact:** Kubernetes deployments can't properly monitor service health.

**Mitigation:**
- Add `/health` (liveness) and `/ready` (readiness) endpoints
- Check database, Redis, and other dependencies
- Return appropriate HTTP status codes

---

### 5. Error Handling Gaps
**File:** `/backend/app/main.py`, `/agent/app/main.py`  
**Issues:**
- Generic `except Exception` blocks that swallow errors (lines 109, 150, 242 in main.py)
- No distinction between recoverable/unrecoverable errors
- No error recovery strategy for lost Redis connections
- Agent silently continues if JSON parsing fails

**Example:**
```python
except Exception as e:
    print(f"Error processing message: {e}", flush=True)
    # Silently continues — might loop forever on bad message
```

**Impact:** Silent failures, resource leaks, difficult debugging.

---

### 6. No Database Migrations Tracking
**File:** `/backend/alembic.ini`  
**Issue:** While Alembic is configured, there's no CI/CD integration shown for auto-migration on startup.

**Risk:** Schema mismatch between code and database in multi-instance deployments.

---

## Scalability Concerns

### 1. Single Agent Worker Architecture
**File:** `/docker-compose.yml`, lines 54-66  
**Issue:** 
- Only one agent service instance
- Commands are queued in `asyncio.Queue` (in-memory, not persistent)
- If agent crashes, queue is lost
- No load distribution across multiple workers

**Impact:** Single point of failure, no parallelism.

**Current Behavior:**
```python
# agent/app/main.py line 12
self.queue = asyncio.Queue()  # In-memory, ephemeral
```

**Mitigation:**
- Consider Celery or RQ for distributed task queue
- Or use Redis list-based queue (LPUSH/BRPOP) like scraper already does
- Multiple agent workers for high throughput

---

### 2. Redis Pub/Sub Not Persistent
**Files:** `/backend/app/main.py` (run_log_listener), `/agent/app/main.py` (command_worker)  
**Issue:** 
- Messages published to `agent_commands` and `agent_responses` use Redis Pub/Sub
- Pub/Sub messages are **not persistent** — if no subscriber is listening, the message is lost
- If backend restarts during agent execution, output is lost

**Current Architecture:**
```
Backend --> redis PUBLISH agent_commands --> Agent
Backend <-- redis PUBLISH agent_responses <-- Agent
```

**Mitigation:**
- Switch to persistent Redis lists (LPUSH/BRPOP) or streams for command queue
- Use Pub/Sub only for real-time notifications, not command delivery
- Scraper already uses the correct pattern: `BRPOP("scraper_results", timeout=0)`

---

### 3. No Batch Processing for Scraped Items
**File:** `/backend/app/main.py`, lines 141-243  
**Issue:** `scraper_results_listener()` processes results one at a time but doesn't batch database inserts. With high-volume scraping, this could cause:
- High database connection churn
- Inefficient batch inserts

Current approach iterates item-by-item.

---

### 4. In-Memory Active Run Tracking
**File:** `/backend/app/main.py`, lines 16-18  
**Issue:** 
```python
_active_output: dict[str, list] = {}  # run_id → list of output lines
_active_started: dict[str, datetime] = {}  # run_id → started_at
```

These dictionaries live in memory. With many concurrent runs, could cause:
- Memory leaks if runs don't complete
- Data loss on restart

---

## Operational Concerns

### 1. No Production-Ready Monitoring
**Issue:** No Prometheus metrics, no APM integration.

**Missing:**
- Request latency histograms
- Command execution durations
- Queue depth metrics
- Error rates per endpoint
- Redis connection pool stats

---

### 2. Inconsistent Response Status Codes
**File:** `/backend/app/routers/arr_instances.py`  
**Examples:**
- `status_code=202` for async triggers (correct)
- `status_code=204` for delete with no body (correct)
- But some create endpoints don't consistently use `201`

**Impact:** API inconsistency, client confusion.

---

### 3. WebSocket Connection Leaks
**File:** `/backend/app/main.py`, lines 311-340  
**Issue:** 
- Each WebSocket client creates a new Redis connection and pubsub subscription
- On disconnect, these are closed — but if an exception occurs before cleanup, resources leak
- No max connection limit

**Current:**
```python
async def terminal_websocket(websocket: WebSocket):
    r = aioredis.from_url(redis_url)  # Created per connection
    pubsub = r.pubsub()
    await pubsub.subscribe("agent_responses")
    # If exception occurs here ↓, resources leak
    try:
        while True:
            await websocket.receive_text()
```

**Mitigation:** Use connection pooling, context managers.

---

### 4. Synchronous Database Calls in Async Context
**File:** Multiple routers  
**Issue:** Some endpoints mix sync and async:
```python
@router.post("...")
async def create_arr_instance(...):  # async function
    existing = db.query(ArrInstance).filter(...).first()  # Blocking call!
```

**Impact:** Blocks the event loop, degrades performance.

---

## Missing Features / Obvious Gaps

### 1. No Rate Limiting
**Risk:** Clients can:
- Spam macro executions
- DOS the database with queries
- Overwhelm the agent worker

**Mitigation:** Add rate limiting (e.g., `slowapi`) per IP/user.

---

### 2. No Input Validation on Command Creation
**File:** `/backend/app/routers/commands.py`, line 18  
**Issue:** Commands are stored as plain strings with no validation:
```python
def create_command(payload: CommandCreate, ...):
    command = Command(**payload.model_dump())  # No validation
```

**Risk:** 
- Empty commands
- Excessively long commands (DoS)
- Commands with dangerous patterns (unchecked)

---

### 3. No Soft Deletes for Historical Data
**File:** Data models  
**Issue:** Deleting a macro deletes all associated commands and runs. Historical execution data is lost.

**Mitigation:** Add `is_deleted` flag instead of hard deletes, or use soft delete ORM patterns.

---

### 4. No Pagination for List Endpoints
**Files:** Routers  
**Issue:** `/api/macros`, `/api/script-runs`, etc. return all records:
```python
def get_macros(session: Session = Depends(get_session)):
    return session.scalars(select(Macro)...).all()  # Returns all
```

**Risk:** With thousands of records, response becomes massive and slow.

**Mitigation:** Add limit/offset or cursor-based pagination.

---

### 5. No Audit Trail
**Issue:** Who created/modified what macro? When? No audit log.

**Missing:** `created_by`, `updated_by`, `created_at`, `updated_at` timestamps on all entities.

---

## Inconsistencies Between Services

### 1. Different Redis Client Initialization
**Issue:** `/backend/app/redis_client.py` uses `redis://localhost:6379/0` as default, all other modules use `redis://redis:6379/0` (Docker service name).

**Impact:** If one service connects, others might fail.

---

### 2. Arr-Searcher Task Queue Pattern
**File:** `/arr_searcher/app/main.py`  
**Issue:** Uses `LPUSH` to `arr_commands` but it's not documented or consistent with other services.

---

### 3. Heterogeneous Error Handling
- Agent uses print + silent failures
- Backend uses HTTPException + print
- Scraper uses print in a loop

**Mitigation:** Standardize on structured logging across all services.

---

## Commented-Out / Abandoned Code

### 1. Docker Socket Access (Conditional)
**File:** `/docker-compose.yml`, lines 60, 96  
```yaml
# - /mnt:/mnt:rshared
```
Several volume mounts are commented out, suggesting they were tried but abandoned. This hints at:
- Previous attempt to mount host volumes for macro execution
- Decision to use Docker socket instead
- Possible unresolved issues with that approach

---

### 2. Incomplete Scheduler Args Handling
**File:** `/backend/app/utils/scheduler.py`, lines 44-45  
```python
if selected_args:
    pass  # TODO: implement
```
Feature was started but never completed.

---

## Dependency Concerns

### 1. Version Pinning
**Files:** `/backend/requirements.txt`, `/agent/requirements.txt`  
**Issue:** No versions specified:
```
fastapi
uvicorn[standard]
sqlalchemy
redis
apscheduler
```

**Risk:** 
- Breaking changes in minor updates
- Dependency hell in shared environments
- Inconsistent deployments across environments

**Mitigation:** Pin major versions at minimum: `fastapi>=0.100,<0.105`

---

### 2. Deprecated Packages
**File:** `/backend/requirements.txt`  
**Issue:** `psycopg2-binary` is included but this is deprecated in favor of `psycopg[binary]` (psycopg v3).

**Concern:** SQLAlchemy is modern (2.0 patterns used), but psycopg2-binary is legacy.

---

### 3. Outdated Dependencies
**Example:** `apscheduler` (2+ years without major update), `redis` (version unspecified).

**Mitigation:** Run `pip-audit` in CI to detect known vulnerabilities.

---

## Additional Observations

### 1. Test Coverage Not Evident
**File:** `/backend/tests/` exists but limited visibility.

**Missing:** Tests for:
- Shell command execution edge cases
- Redis connection failures
- Database transaction rollback
- Concurrent macro execution

---

### 2. No DataValidation on Cron Expressions
**File:** `/backend/app/utils/scheduler.py`, line 68  
```python
scheduler.add_job(
    ...,
    CronTrigger.from_crontab(schedule.cron_expression, ...)  # No validation
)
```

Invalid cron expressions will fail at runtime, not at schedule creation.

**Mitigation:** Validate in the schema/router before saving.

---

### 3. Tight Coupling to Redis
All inter-service communication depends on Redis. If Redis is down:
- Commands can't be sent to agent
- Agent output isn't received by backend
- No fallback/degraded mode

---

### 4. No Graceful Shutdown
**Files:** Agent and backend main loops  
**Issue:** No signal handlers for SIGTERM. Services might be forcefully killed, losing in-flight work.

**Mitigation:** Add `signal.signal(SIGTERM, graceful_shutdown_handler)`.

---

## Risk Prioritization

| Priority | Issue | Impact |
|----------|-------|--------|
| **Critical** | No authentication/authorization | Full system compromise |
| **Critical** | Shell command injection | Code execution as agent user |
| **Critical** | Plain-text API keys | Credential theft |
| **High** | Docker socket exposure | Container escape risk |
| **High** | Redis Pub/Sub not persistent | Message loss on crash |
| **High** | No health checks | K8s can't manage services |
| **Medium** | No logging framework | Debugging/monitoring failure |
| **Medium** | Single agent worker | Single point of failure |
| **Medium** | No rate limiting | DoS vulnerability |
| **Low** | Version pinning | Maintenance burden |

---

## Recommended Next Steps

1. **Week 1:** Add authentication (JWT or mTLS) + authorization checks
2. **Week 1:** Encrypt API keys at rest
3. **Week 2:** Switch command delivery to persistent Redis queues
4. **Week 2:** Add proper logging framework
5. **Week 3:** Implement health check endpoints
6. **Week 3:** Add input validation on macros
7. **Ongoing:** Pin dependency versions, add security scanning to CI

