# Pitfalls: Agent Heartbeat Implementation

## Critical Pitfalls

### 1. Using KEYS to count heartbeat entries
**Warning signs:** `KEYS agent:heartbeat:*` in backend code; slow API responses under load; Redis CPU spikes.
**Prevention:** `KEYS` is O(N) over the entire keyspace and blocks Redis's single-threaded event loop while it scans. In a production Redis instance shared by multiple services (as this project uses Redis for pub/sub, BRPOP queue, and now heartbeats), a `KEYS` call can block all other operations for tens of milliseconds — long enough to delay command dispatch or cause agent response backpressure. Use `SCAN` with a cursor and `MATCH agent:heartbeat:* COUNT 100` in a loop, collecting results until the cursor returns 0. For this specific use case (just a count), a purpose-built Redis Set is even better: agents do `SADD agent:heartbeats <agent_id>` and `EXPIRE agent:heartbeats <ttl>` (or use a Sorted Set with timestamp as score), and the backend calls `SCARD agent:heartbeats`. However, since each agent needs its own TTL (per-agent expiry), the SCAN approach or a Sorted Set with per-member expiry via Lua is correct.
**Phase to address:** Before writing the `/api/agent/count` endpoint — this is a foundational choice.

---

### 2. TTL shorter than heartbeat interval (premature expiry)
**Warning signs:** Agent count flickers between N and 0 in the UI; agents appear to disappear and reappear; count shows 0 even when agents are clearly processing commands.
**Prevention:** The heartbeat interval and TTL must have an adequate safety margin. A common rule is TTL >= 3× the heartbeat interval to survive one or two missed writes without expiring. Example: if agents write every 10 seconds, set TTL to 30 seconds (`SETEX agent:heartbeat:<id> 30 1`). The PROJECT.md already specifies 30s TTL — pairing this with a 10s interval is appropriate. Tighter ratios (e.g., 25s TTL, 10s interval) create a window where a brief asyncio event loop stall (e.g., during a long-running subprocess) delays the heartbeat coroutine past the TTL, briefly dropping the count.
**Phase to address:** Agent implementation, before the heartbeat loop is written.

---

### 3. TTL much longer than heartbeat interval (stale counts)
**Warning signs:** Agent count stays elevated after agents are killed or scaled down; the count shows 3 when only 1 agent is running; Kubernetes pod restarts don't clear the old count promptly.
**Prevention:** A TTL that is too long (e.g., 5 minutes with a 10s interval) means a crashed or scaled-down agent's key persists and inflates the count for minutes. In Kubernetes, pods are killed abruptly — there is no graceful shutdown hook that will delete the key. The TTL is the only cleanup mechanism. Keep TTL proportional: 2–3× the heartbeat interval, no more. 30s TTL with 10s heartbeat is the right balance for this project.
**Phase to address:** Agent implementation.

---

### 4. Agent ID collision on container restart (same hostname, new UUID not generated)
**Warning signs:** After a pod restart, two heartbeat keys exist for the "same" logical agent slot; count briefly shows N+1; or — worse — the restarted agent reuses the old key and its TTL clock is reset, which is actually fine, but only if IDs are stable per-container-instance.
**Prevention:** In Kubernetes, `hostname` is stable within a pod's lifecycle but is reused after a restart (the pod name is the same unless the pod is fully deleted). If agent ID is derived from `socket.gethostname()`, the restarted agent writes to the same key as the old one — which is actually acceptable for a count-only use case (the key just gets refreshed). However, if `uuid.uuid4()` is used (as already imported in `agent/app/main.py`), each restart creates a new key and the old key must expire on its own. During the TTL window after a restart, the count will be inflated by 1 per restarted agent. For a count-only display, this is tolerable. The project's existing `import uuid` in the agent suggests UUID-based IDs are natural — just accept the brief double-count window and document it.

If strict accuracy is needed: use `hostname` as the agent ID so restarts overwrite the same key. But hostname-based IDs collide if two distinct agent containers happen to share a hostname (unlikely in Kubernetes where pod names are unique, but possible in Docker Compose where container names can overlap).

**Phase to address:** Agent ID generation decision, before writing the heartbeat loop.

---

### 5. Redis connection pool exhaustion from heartbeat loops
**Warning signs:** `redis.exceptions.ConnectionError: Too many connections`; backend health checks start failing; BRPOP queue stops processing commands; connection errors appear in agent logs under sustained load.
**Prevention:** The current `agent/app/main.py` creates a single `redis.from_url(redis_url)` connection shared across all three async tasks (`command_worker`, `command_listener`, `control_listener`). Adding a heartbeat coroutine that calls `r.setex(...)` in a loop on the same connection is safe as long as it is the same `r` object. The danger is if the heartbeat is implemented with its own connection (e.g., a new `redis.from_url(...)` inside the heartbeat function). With 10 agent containers each opening 2 connections, that's 20 connections — fine for Redis's default 10,000 limit. However, if the backend's `GET /api/agent/count` endpoint also creates a new connection per request (as the current `get_redis` dependency does via `redis.from_url` on each call), and the frontend polls every 5 seconds, that's a new connection created and closed every 5 seconds. This is acceptable but inefficient. Better: use a module-level connection pool on the backend, initialized once at startup, shared across all requests.
**Phase to address:** Backend endpoint implementation.

---

### 6. Frontend polling causing unnecessary re-renders
**Warning signs:** React DevTools shows the terminal component re-rendering every 5 seconds even when the count hasn't changed; terminal scroll position jumps; chat history list flickers.
**Prevention:** A naive `setInterval` that calls `setAgentCount(data.count)` on every poll will trigger a re-render even when the value is unchanged. React's state setter does bail out if the new value is the same primitive, but only for direct state (not objects). Since agent count is a simple integer, `useState` with a number is safe — React will skip the re-render if the value hasn't changed. Ensure the state is stored as a number, not an object like `{ count: 3 }`. Place the polling in a `useEffect` with a `setInterval` and clean up on unmount. Do not store the full API response object in state; extract only the count integer.

Additionally, the polling `useEffect` should have an empty dependency array `[]` so it runs once and is not re-created on every render. If the WebSocket disconnect/reconnect (managed by `TerminalContext`) causes the ChatTerminal component to remount, the polling interval will be recreated — ensure the count state lives in a stable parent or context, not in a child that unmounts.

**Phase to address:** Frontend implementation of the count display.

---

### 7. Race condition between heartbeat write and count read
**Warning signs:** Count reads 0 immediately after agent startup even though the agent is running; intermittent off-by-one counts under high churn (many agents starting/stopping simultaneously).
**Prevention:** There is a small window at agent startup between process launch and the first `SETEX` write where the agent is live but uncounted. This is unavoidable with a polling-based approach and is acceptable for a count-only display. The window is at most the heartbeat interval (10 seconds). More subtle: the backend's `SCAN` loop reads keys as Redis scans them. If an agent writes a new key mid-scan, `SCAN` may or may not include it in the current iteration. For a simple count display this is inconsequential — the value self-corrects on the next poll.

A real race condition would exist if the count were used for routing (e.g., "only dispatch if count > 0") — but this project's dispatch goes through BRPOP regardless, so the count is purely informational and the race is harmless.
**Phase to address:** Be aware during implementation; no active mitigation required beyond documentation.

---

### 8. Redis unavailability crashing the agent or backend
**Warning signs:** Agent process exits when Redis goes down; backend 500s on `/api/agent/count`; the entire ChatTerminal becomes unusable because the heartbeat coroutine throws an unhandled exception.
**Prevention:**

**Agent side:** The heartbeat loop must catch all Redis exceptions and retry with backoff, not propagate them to `asyncio.gather`. If the heartbeat coroutine raises, `asyncio.gather` cancels the other tasks (command_worker, command_listener, control_listener), taking down the whole agent. Wrap the `setex` call in `try/except Exception` and log + sleep on failure. The agent should continue processing commands even if heartbeat writes fail.

**Backend side:** The `/api/agent/count` endpoint must catch `redis.exceptions.RedisError` and return a graceful response (e.g., `{"count": null}` or `{"count": 0, "error": "redis_unavailable"}`) rather than a 500. The frontend should handle a null/error count by hiding the count display or showing "?" rather than crashing the component.

**Current code risk:** `agent/app/main.py` line 165 uses `asyncio.gather(command_worker, command_listener, control_listener)` without `return_exceptions=True`. Adding a heartbeat coroutine to this gather means any unhandled exception in the heartbeat will cancel all other tasks. Either add `return_exceptions=True` or ensure the heartbeat coroutine has its own internal exception handling.
**Phase to address:** Agent implementation — critical for production stability.

---

## Less Critical

### Heartbeat coroutine blocking the event loop during subprocess execution
The existing agent runs `execute_and_stream` which uses `asyncio.create_subprocess_shell` — fully async. The heartbeat's `await asyncio.sleep(10)` and `await r.setex(...)` are also non-blocking. No blocking risk as long as no `time.sleep()` is used in the heartbeat. If the command worker ever calls a synchronous blocking function (e.g., `subprocess.run`), the heartbeat would be delayed and could expire the key. The current implementation is async throughout, so this is not a current concern but worth keeping in mind if the agent evolves.

### Key namespace collisions
Using `agent:heartbeat:<id>` is safe given the current keyspace (`agent_commands` and `agent_responses` are channel names, not keys). Just avoid using a prefix that collides with an existing key pattern. No collision risk in the current codebase.

### Clock skew between containers
Redis TTL is server-side; agent heartbeat interval is client-side. Clock skew between the agent container and Redis server is irrelevant because TTL countdown happens on Redis, not the agent. No issue here.

### Polling interval too short causing Redis load
A 5-second frontend poll hitting `/api/agent/count` which runs a `SCAN` is negligible load at this scale (1–10 agents). If the system scaled to hundreds of agents, the SCAN would need optimization (e.g., a counter maintained separately). Not a concern for the current deployment size.

### Kubernetes liveness probe interaction
If a Kubernetes liveness probe is configured on the agent pod and it depends on Redis connectivity, a Redis outage could trigger pod restarts in a loop — amplifying the double-count problem (pitfall 4). The current agent has no liveness probe in the Helm chart, so this is a future concern if probes are added.
