# Research Summary: Agent Count Feature

**Project:** ServerToolPython — Agent Count Display
**Date:** 2026-03-28

## Recommended Stack

**Redis SETEX per-agent key** — `SETEX agent:heartbeat:<uuid> 30 1` written by each agent every 10 seconds. No new infrastructure; Redis already handles all agent coordination.

**Backend: `SCAN`-based count** — `scan_iter("agent:heartbeat:*")` in a new `GET /api/agent/count` route added to the existing `backend/app/routers/agent.py`. The endpoint is ~4 lines. Never use `KEYS` (blocking O(N)).

**Frontend: `setInterval` polling** — a dedicated `useAgentCount` hook at `frontend/app/hooks/useAgentCount.ts` polls every 15 seconds. State is `number | null` (null = loading). Silent-fail on errors; keep last known value rather than resetting to 0.

**Agent ID: UUID4** — `AGENT_ID = str(uuid.uuid4())` at module level. `uuid` is already imported. Avoids PID collisions across containers and hostname reuse edge cases during rolling updates.

## Table Stakes Features

- Count reflects reality within one poll cycle (~15s) after an agent starts or stops
- Visual distinction between "0 agents" (red dot) and loading/error (neutral dot) — never conflate a fetch failure with "no agents"
- Singular/plural label: `1 AGENT` / `N AGENTS` in `font-mono text-[9px] uppercase tracking-widest`
- Neutral loading state (`null`) on first render — no flash of 0 before first fetch returns
- Footer layout unchanged: second dot+label inserted after connection status, separated by `·`, right-side environment/tag stays right-aligned
- Agent heartbeat must not interfere with command execution — purely additive coroutine

## Critical Architecture Decisions

1. **SETEX keys over Redis SET membership.** Agents are killed with SIGKILL (see `kill_current_task()`); there is no guaranteed clean shutdown. SADD/SREM requires SREM on shutdown — stale entries accumulate permanently. SETEX auto-expires dead agents with no cleanup code. This is non-negotiable.

2. **Polling over WebSocket push.** The `/ws/terminal` channel is purpose-built for streaming command output. Multiplexing agent count into it couples presence state to terminal output state, complicates `TerminalContext.tsx`, and is unnecessary for a value that changes maybe once per deployment. REST poll at 15s is zero overhead.

3. **Heartbeat as a fourth `asyncio.gather` coroutine.** The agent already runs three coroutines in `asyncio.gather`. The heartbeat slots in as a fourth with no structural change. Critical: the gather currently lacks `return_exceptions=True` — an unhandled exception in the heartbeat will cancel all other tasks. The heartbeat coroutine must catch all exceptions internally and never propagate them.

## Top Pitfalls to Avoid

1. **`KEYS` instead of `SCAN` on the backend.** `KEYS` blocks Redis's single-threaded event loop for the entire keyspace scan — can delay command dispatch or cause BRPOP backpressure. Prevention: always use `scan_iter("agent:heartbeat:*")`.

2. **TTL too tight relative to heartbeat interval.** If `asyncio`'s event loop is saturated reading subprocess stdout, the heartbeat coroutine fires late. A 1x or 2x TTL causes false "0 agents" flickers. Prevention: use 3x multiplier minimum — 10s interval, 30s TTL as specified in PROJECT.md.

3. **Heartbeat exception crashing the whole agent.** `asyncio.gather` without `return_exceptions=True` cancels all coroutines if any one raises. A Redis outage would kill command execution. Prevention: wrap `setex` in `try/except Exception` inside the heartbeat loop; add `return_exceptions=True` to the gather call.

4. **Frontend showing `0` on fetch error.** A transient network blip that returns a failed fetch must not display "0 agents" — indistinguishable from all agents genuinely down. Prevention: on fetch failure, keep the previous `count` value unchanged; only update state on a successful `res.ok` response.

## Build Order

1. **Agent heartbeat coroutine** (`agent/app/main.py`) — generate `AGENT_ID`, implement `heartbeat(r, agent_id)` with internal exception handling, add to `asyncio.gather` with `return_exceptions=True`. Verify: `redis-cli KEYS 'agent:heartbeat:*'` while agent runs.

2. **Backend count endpoint** (`backend/app/routers/agent.py`) — add `GET /count` using `scan_iter`. No `main.py` changes needed. Verify: `curl /api/agent/count`.

3. **Frontend hook** (`frontend/app/hooks/useAgentCount.ts`) — implement polling with `null` initial state, silent error handling, 15s interval. Independently testable.

4. **Footer UI** (`frontend/app/components/ChatTerminal.tsx`) — consume `useAgentCount`, render second dot + label using design system colors from `frontend/design/code.html`. Dot color: `bg-primary-fixed-dim` (count >= 1), `bg-error` (count === 0 confirmed), `bg-outline` (null/loading).

## Open Questions

- **`KEYS` vs `SCAN` in the architecture doc:** ARCHITECTURE.md uses `r.keys()` in the sample endpoint code, but STACK.md and PITFALLS.md both say `KEYS` is forbidden in production. The implementation must use `scan_iter` — the ARCHITECTURE.md sample is a simplification to be ignored.
- **UUID4 vs hostname for agent ID:** UUID4 means a restarted pod creates a new key; the old key inflates the count by 1 for up to 30s. Hostname means restarts overwrite the same key (no double-count) but risks collision in Docker Compose where container names can overlap. Decision: UUID4 is preferred per STACK.md; accept the brief +1 window during restarts.
- **Backend connection pooling:** The current `get_redis` dependency creates a connection per request. At 15s poll intervals this is acceptable, but a module-level connection pool would be cleaner if the endpoint is extended later. Not blocking for initial implementation.
