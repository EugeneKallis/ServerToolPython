# Stack Research: Agent Heartbeat & Redis Presence Tracking

## Recommended Approach

Use `SETEX agent:heartbeat:<agent_id> 30 "1"` written by each agent every 10 seconds. The backend counts live agents via `SCAN` with the `agent:heartbeat:*` pattern and returns `SCARD` of the matched keys (i.e., count the scan results). The frontend polls `GET /api/agent/count` every 10 seconds and renders the count in the footer.

This is the correct approach for this system because:
- The agents already run an `asyncio.gather()` with multiple concurrent coroutines (`command_worker`, `command_listener`, `control_listener`). A fourth heartbeat coroutine slots in without any structural change.
- SETEX keys self-expire, so dead agents (crash, OOM kill, node eviction) disappear automatically without any cleanup code.
- The backend already uses `redis.asyncio` via dependency injection. The count endpoint is a 4-line addition to the existing `agent.py` router.
- PROJECT.md explicitly documents this pattern as the chosen design: "SETEX agent:heartbeat:<agent_id> 30 1".

Confidence: HIGH. This pattern is well-established in production Redis deployments for exactly this use case.

---

## Redis Data Structure Options

### Option A: SETEX per agent key — RECOMMENDED

```
SETEX agent:heartbeat:<agent_id> 30 "1"
```

- Each live agent owns one key.
- TTL is set on every heartbeat write, so the key auto-expires 30 seconds after the last write.
- Count = number of matching keys found by SCAN.
- No cleanup code required for crashed agents.
- Key pattern `agent:heartbeat:*` is unambiguous and won't collide with other keys in this system (existing patterns are `scraper:status:*`).

Confidence: HIGH.

### Option B: Redis SET membership (SADD / SREM)

```
SADD agent:live <agent_id>
SREM agent:live <agent_id>   # on clean shutdown
SCARD agent:live             # O(1) count
```

- SCARD is O(1) and the cleanest count query.
- Fatal flaw for this workload: requires the agent to explicitly SREM on shutdown. Agent containers are killed with SIGKILL (see `kill_current_task()` in `agent/app/main.py` line 19), crash on OOM, or are evicted by Kubernetes. There is no guarantee the SREM fires. Stale members accumulate silently.
- Requires a separate TTL/expiry mechanism (e.g., a sorted set shadow or a periodic cleanup job) to remove dead members, adding complexity.

Verdict: Do NOT use for this system. The SIGKILL-based reset mechanism makes clean shutdown unreliable.

### Option C: Sorted set with score = Unix timestamp (ZADD / ZRANGEBYSCORE)

```
ZADD agent:heartbeats <unix_ts> <agent_id>
ZRANGEBYSCORE agent:heartbeats <now-30> +inf  # count live agents
```

- Enables listing individual agents with their last-seen timestamps.
- O(log N) writes, O(log N + M) range queries.
- Overkill for the stated requirement (count only, no per-agent identity in UI per PROJECT.md Out of Scope).
- Stale members persist in the set forever unless explicitly removed with ZREMRANGEBYSCORE. This requires the backend to call ZREMRANGEBYSCORE on every count query, adding a write to every read path.
- Cannot set a TTL on the sorted set without expiring the entire set.

Verdict: Reserve for a future requirement where per-agent last-seen timestamps are needed. Not appropriate now.

### Option D: Redis pub/sub subscriber count

Using `PUBSUB NUMSUB agent_commands` to infer agent count is unreliable: the agent uses BRPOP (a list queue), not pub/sub subscribe for its command intake. The `control_listener` coroutine does use pub/sub, but subscriber count includes any transient connections and is not a health signal.

Verdict: Do NOT use.

---

## Heartbeat Interval & TTL

| Parameter | Recommended Value | Reasoning |
|-----------|------------------|-----------|
| Heartbeat interval | **10 seconds** | Frequent enough to keep keys alive; low enough that a dead agent is detected within one TTL window (30s) |
| SETEX TTL | **30 seconds** | 3x the heartbeat interval. Industry standard multiplier is 2x–5x; 3x provides tolerance for one missed heartbeat (e.g., agent briefly busy executing a long subprocess line) without falsely marking an agent dead |
| Max detection lag | **~30 seconds** | A crashed agent's key expires 30s after its last write. The frontend's 10s poll may show the count drop anywhere from 0–10s after expiry |

Rationale for 3x multiplier: The agent's `command_worker` coroutine can block for the duration of a subprocess execution. Asyncio's cooperative scheduling means if the event loop is saturated reading subprocess output, a `asyncio.sleep(10)` heartbeat task may fire late. A 3x TTL absorbs one missed interval gracefully. 5x is common in distributed systems literature; 3x is appropriate here because the agent is a single-process worker, not a distributed node with network partition risk.

Confidence: HIGH for the 3x multiplier. The specific 10s/30s values match the PROJECT.md decision and are the most commonly deployed values in similar Python/Redis systems.

---

## Agent ID Generation

### Recommended: UUID4 generated at startup

```python
AGENT_ID = str(uuid.uuid4())
```

Generate once when the Python process starts (module level or in `run_agent()`), use for the lifetime of the process.

Rationale:
- `uuid` is already imported in `agent/app/main.py` (line 6) — zero new dependencies.
- UUID4 guarantees uniqueness across container restarts, even when multiple containers start simultaneously on the same node.
- The agent's Redis key becomes `agent:heartbeat:f47ac10b-58cc-4372-a567-0e02b2c3d479` — inherently unique.

### Alternative: hostname-based ID

```python
import socket
AGENT_ID = socket.gethostname()
```

- In Kubernetes, the pod hostname is the pod name (e.g., `agent-7d4b9f-xk2pq`), which is unique per pod.
- Readable in Redis CLI for debugging.
- Risk: if the same pod name is reused during a rolling update and the old key hasn't expired yet, you get one key for two distinct lifecycles. With SETEX this is harmless (the new agent just refreshes the TTL), but it prevents distinguishing old vs. new instance if that ever matters.

### Recommendation: UUID4 over hostname

UUID4 is preferable because the goal is **count**, not **identification**. UUID4 is already available, avoids any edge case with hostname reuse, and is already the pattern used elsewhere in the agent (`run_id = str(uuid.uuid4())`).

Confidence: HIGH.

### What NOT to do: PID-based IDs

```python
AGENT_ID = str(os.getpid())
```

PIDs are not unique across containers. Two agents in different containers could have PID 1 (typical for Docker entrypoints). Do not use.

---

## Backend Count Query

### Recommended: SCAN with match pattern

```python
@router.get("/count")
async def get_agent_count(r: redis.Redis = Depends(get_redis)):
    count = 0
    async for key in r.scan_iter("agent:heartbeat:*"):
        count += 1
    return {"count": count}
```

`scan_iter` is the async iterator wrapper around SCAN. It pages through the keyspace in batches (default COUNT hint: 10) without blocking the Redis server. This is safe for production Redis with a large keyspace.

Why not `KEYS agent:heartbeat:*`?

`KEYS` is a blocking O(N) command that scans the entire keyspace in a single call and blocks all other Redis clients for its duration. It is explicitly forbidden in production Redis deployments. With thousands of scraper result keys or other application keys present, KEYS can block for milliseconds to seconds. Never use KEYS in application code.

Why not SCARD?

SCARD requires the SET membership approach (Option B above), which is unsuitable here. SETEX keys do not participate in a Redis SET.

### Performance note

This system has a small number of agent instances (1–5 in typical deployments per the Helm chart). The SCAN will complete in a single round trip in practice. Even at 100 agents the scan_iter loop is negligible overhead. The SCAN cursor approach is correct regardless of scale.

Confidence: HIGH.

---

## Frontend Polling

### Recommended: `setInterval` polling every 10 seconds

```typescript
// In a React hook or context
useEffect(() => {
  const fetchCount = async () => {
    const res = await fetch('/api/agent/count');
    const data = await res.json();
    setAgentCount(data.count);
  };
  fetchCount(); // immediate on mount
  const interval = setInterval(fetchCount, 10_000);
  return () => clearInterval(interval);
}, []);
```

Rationale:
- Agent count does not need sub-second latency. The PROJECT.md explicitly notes "count doesn't need sub-second latency" as the rationale for polling over WebSocket push.
- 10 seconds matches the heartbeat interval. A newly started agent is visible within one poll cycle after it writes its first heartbeat.
- A dead agent disappears within 30s (TTL) + up to 10s (poll interval) = worst case 40 seconds. Acceptable for this UI indicator.
- 10s polling generates 6 HTTP requests/minute per browser tab. Negligible backend load.

### Do NOT push agent count over the existing WebSocket

The `/ws/terminal` WebSocket is purpose-built for streaming command output. Multiplexing agent count changes into the same channel would require message-type discrimination on the frontend, add complexity to `TerminalContext.tsx`, and create a coupling between terminal output state and agent presence state. Keep them separate.

### Error handling

The fetch should silently degrade on failure (show last known count or "--") rather than surfacing an error to the user. Agent count is a secondary status indicator, not a critical UI element.

Confidence: HIGH.

---

## What NOT to Use

| Anti-pattern | Why |
|---|---|
| `KEYS agent:heartbeat:*` | Blocking O(N) Redis command. Forbidden in production. Use `SCAN` instead. |
| Redis SET membership (SADD/SREM) for presence | Requires clean shutdown to SREM. Agents are killed with SIGKILL; stale entries accumulate. |
| Sorted set (ZADD) for count-only use case | Overkill. Requires periodic ZREMRANGEBYSCORE cleanup on the read path. |
| WebSocket push for agent count | Couples presence state to terminal output channel. Unnecessary complexity for a low-frequency status update. |
| PID-based agent IDs | Not unique across containers. PIDs repeat across Docker entrypoints. |
| Pub/sub subscriber count (`PUBSUB NUMSUB`) | Agents use BRPOP, not pub/sub for command intake. Subscriber count is not a health proxy. |
| TTL == heartbeat interval (1x multiplier) | One late heartbeat (agent busy with subprocess) causes a false "agent dead" flicker. Use 3x minimum. |
| Heartbeat interval > 30 seconds | Increases detection lag beyond 60–90 seconds. Too slow for a live footer indicator. |
| Storing heartbeat in PostgreSQL | Unnecessary write load on the primary DB for ephemeral state. Redis TTL is purpose-built for this. |
