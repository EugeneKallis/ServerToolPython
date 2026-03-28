# ServerToolPython

## What This Is

ServerToolPython is a full-stack web application for managing, executing, and monitoring shell commands via a real-time streaming terminal interface. It uses a microservices architecture with a FastAPI backend, Next.js frontend, Python agent workers, PostgreSQL, and Redis. Users interact with a chat-terminal UI on the home page, executing macros that are dispatched to agent containers via Redis.

## Core Value

Commands dispatched from the UI must execute reliably on agent containers and stream output back in real time.

## Requirements

### Validated

- ✓ Macro management (create, edit, delete macros with commands and arguments) — existing
- ✓ Real-time terminal output streamed via WebSocket from agent to frontend — existing
- ✓ Agent command dispatch via Redis pub/sub (BRPOP queue) — existing
- ✓ Cron-based macro scheduling via APScheduler — existing
- ✓ Script run history persisted to PostgreSQL — existing
- ✓ Agent reset (kill current task + clear queue) via control channel — existing
- ✓ Chat interface with conversation history and file attachments — existing
- ✓ Connection status indicator in terminal footer (connected/connecting/disconnected) — existing
- ✓ Multi-agent support via BRPOP (multiple agent containers share the queue) — existing

### Active

- [ ] Agent count display in the terminal footer — show how many agent containers are currently live, alongside the existing connection status dot
- [ ] Agent heartbeat mechanism — each agent periodically writes a short-lived Redis key so the backend can count live agents
- [ ] Macro commands execute sequentially as a single bash script (stop-on-failure) — currently dispatched as N independent queue messages

### Out of Scope

- Per-agent identification/naming in the UI — not requested; count only
- Agent-specific command routing — no requirement to target individual agents

## Context

The system currently supports multiple agent containers consuming commands from a shared Redis BRPOP queue, but there is no registration or heartbeat mechanism — agents are invisible to the backend beyond the commands they process. The footer of the ChatTerminal component (`frontend/app/components/ChatTerminal.tsx:676`) currently shows a dot + "connected/connecting/disconnected" status and environment info.

The heartbeat pattern will use `SETEX agent:heartbeat:<agent_id> 30 1` with a unique ID per agent instance (UUID or hostname). The backend will expose a `GET /api/agent/count` endpoint that counts matching Redis keys. The frontend will poll this endpoint and render the count as a second dot + "N agents" in the footer.

## Constraints

- **Tech Stack**: FastAPI backend, Next.js/Tailwind frontend, Redis for all agent coordination — no new infrastructure
- **Design System**: Must use colors/fonts from `frontend/design/code.html` — no invented values
- **Agent Compatibility**: Heartbeat must not interfere with existing command execution (BRPOP loop runs concurrently)
- **Deployment**: Works with existing Docker Compose (dev) and Kubernetes/Helm (prod) — no chart changes required for heartbeat env vars

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Redis SETEX heartbeat (not pub/sub subscriber count) | Reliable, survives agent reconnects, TTL auto-expires dead agents | — Pending |
| Poll from frontend (not WebSocket push) | Simple; count doesn't need sub-second latency | — Pending |
| Dot + count display style | Matches existing footer dot pattern, user confirmed preference | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after initialization*
