# Architecture Research: Heartbeat Integration

## Agent-Side Heartbeat

**How to run the heartbeat coroutine alongside existing tasks**

The agent already runs three coroutines via `asyncio.gather` in `run_agent()`:
- `command_worker(r)` — drains the internal asyncio queue
- `command_listener(r)` — BRPOP loop
- `control_listener(r)` — pub/sub subscriber

The heartbeat should be added as a fourth coroutine passed to the same `asyncio.gather` call. This is the correct pattern because:
- `asyncio.gather` is already the top-level concurrency primitive in the agent
- All four coroutines share the same event loop and run cooperatively
- A heartbeat loop with `asyncio.sleep(10)` between iterations is purely I/O-bound (a Redis SET), so it yields control cleanly and never blocks the command execution path

**Heartbeat coroutine structure:**

```python
async def heartbeat(r: redis.Redis, agent_id: str, interval: int = 10, ttl: int = 30):
    key = f"agent:heartbeat:{agent_id}"
    while True:
        try:
            await r.setex(key, ttl, 1)
        except Exception as e:
            print(f"Heartbeat error: {e}", flush=True)
        await asyncio.sleep(interval)
```

Key parameters:
- `interval=10` — write every 10 seconds
- `ttl=30` — key expires after 30 seconds (3x the interval; survives two missed beats before expiring)
- `agent_id` — generate once at startup with `str(uuid.uuid4())` or `socket.gethostname()`

The agent already imports `uuid` so `str(uuid.uuid4())` at module level (alongside `task_manager = TaskManager()`) is the natural place to generate the ID.

**No interference with command execution:** the heartbeat coroutine only runs during its `asyncio.sleep(10)` gaps. The BRPOP loop uses `timeout=0` which also yields to the event loop; no starvation risk exists between these coroutines.

## Redis Connection Strategy

**Use the same shared `redis.Redis` connection passed from `run_agent()`.**

The existing agent creates one `redis.from_url(redis_url)` instance and passes it to all three coroutines. The heartbeat should receive the same `r` parameter.

Rationale:
- `redis.asyncio` connections are multiplexed — multiple coroutines can share one connection safely because each `await` call is atomic at the Redis protocol level
- The `control_listener` already uses a separate `pubsub` object derived from `r`; the pub/sub subscription and the SETEX heartbeat do not conflict
- Adding a second connection purely for heartbeat adds unnecessary overhead and a second failure point
- Exception: if Redis pub/sub `listen()` blocks the connection in a way that prevents other commands, a separate connection for heartbeat is warranted. In practice, `redis.asyncio` pub/sub uses a dedicated internal connection when you call `r.pubsub()`, so the base `r` connection remains free for commands like SETEX, BRPOP, and PUBLISH

**Conclusion:** pass the same `r` to `heartbeat(r, agent_id)` in the gather call. If connection contention is ever observed in testing, a second `redis.from_url` for heartbeat only is a clean fallback.

## Backend Endpoint

**Where to add `GET /api/agent/count`**

Add it to the existing `backend/app/routers/agent.py`. This file already:
- Has a `router = APIRouter(prefix="/agent")`
- Has a `get_redis()` dependency
- Is registered in `main.py` as `api_router.include_router(agent.router)`

Adding a second route to the same file keeps all agent-related endpoints co-located and requires no new file, no new router registration, and no changes to `main.py`.

**Endpoint structure:**

```python
@router.get("/count")
async def get_agent_count(r: redis.Redis = Depends(get_redis)):
    try:
        keys = await r.keys("agent:heartbeat:*")
        return {"count": len(keys)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to count agents: {str(e)}")
```

This resolves to `GET /api/agent/count` given the existing `/api` prefix in `main.py` and `/agent` prefix in the router.

**Note on `r.keys()` vs `r.scan_iter()`:** `KEYS agent:heartbeat:*` is acceptable for this use case — the number of live agent containers is small (single digits) and this endpoint is polled infrequently (every 15–30s). `SCAN` iteration is only necessary when the key space is large. Keep it simple with `KEYS`.

**Not a WebSocket concern:** the agent count does not need to be pushed over the existing `/ws/terminal` WebSocket. The count is ancillary status information (not command output), changes infrequently, and adding it to the WebSocket stream would couple unrelated concerns. A simple REST poll is appropriate.

## Frontend Integration

**Where to put the polling logic**

Create a new custom hook: `frontend/app/hooks/useAgentCount.ts`

Do not add it to `TerminalContext`. Reasons:
- `TerminalContext` manages WebSocket state and command output — a different responsibility than agent health polling
- The hook is needed only in `ChatTerminal.tsx` (the footer); other consumers of `TerminalContext` do not need the count
- A focused hook is easier to test and reuse independently

**Hook structure:**

```typescript
import { useState, useEffect } from 'react';

export function useAgentCount(intervalMs = 15000) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch('/api/agent/count');
        if (res.ok && active) {
          const data = await res.json();
          setCount(data.count);
        }
      } catch {
        // silently fail; stale count is preferable to error state
      }
    }

    poll(); // immediate first fetch
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return count;
}
```

**Usage in `ChatTerminal.tsx`:**

```typescript
const agentCount = useAgentCount(15000);
```

Then in the footer JSX, add a second dot + label alongside the existing status indicator, using only colors from `frontend/design/code.html`.

**Poll interval:** 15 seconds is appropriate. Agent heartbeats write every 10s with a 30s TTL. A 15s poll gives near-real-time visibility while avoiding unnecessary backend load. The count can be 0–25 seconds stale in the worst case, which is acceptable for a status display.

**Initial state:** `null` (not yet fetched). The footer should render nothing or a neutral indicator until the first response arrives, to avoid a flash of "0 agents" on load.

## Component Boundaries

```
[Agent container(s)]
    └── heartbeat coroutine
            └── SETEX agent:heartbeat:<uuid>  TTL=30s  every 10s
                        │
                    [Redis]
                        │
[Backend FastAPI]
    ├── GET /api/agent/count  ←── reads KEYS agent:heartbeat:*  →  { count: N }
    └── (existing WebSocket, pub/sub — unchanged)
                        │
[Frontend]
    ├── useAgentCount hook  (polls /api/agent/count every 15s)
    │       └── agentCount: number | null
    └── ChatTerminal.tsx footer
            ├── existing: dot + "connected/connecting/disconnected"  (from TerminalContext.status)
            └── new: dot + "N agents"  (from useAgentCount)
```

No existing data flows are modified. The heartbeat is additive at every layer.

## Build Order

1. **Agent: heartbeat coroutine** — add `heartbeat(r, agent_id)` coroutine to `agent/app/main.py`, generate `AGENT_ID = str(uuid.uuid4())` at module level, add to `asyncio.gather` in `run_agent()`. Verify with `redis-cli KEYS 'agent:heartbeat:*'` while agent is running.

2. **Backend: count endpoint** — add `GET /count` to `backend/app/routers/agent.py`. Verify with `curl /api/agent/count`. No `main.py` changes needed.

3. **Frontend: hook** — create `frontend/app/hooks/useAgentCount.ts`. Unit-testable in isolation.

4. **Frontend: footer UI** — consume `useAgentCount` in `ChatTerminal.tsx` and render the second dot + count in the footer. Follow design system colors from `frontend/design/code.html` for the dot color (e.g., use `bg-secondary-fixed-dim` for agents, distinct from the existing connection dot).

This sequence means each step is independently verifiable before the next begins. The backend endpoint can be tested with curl before any frontend work. The hook can be tested before the UI wiring.
