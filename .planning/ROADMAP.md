# Roadmap: Agent Count Display

**Milestone:** v1.0 — Agent Count in Terminal Footer
**Requirements:** .planning/REQUIREMENTS.md
**Config:** coarse granularity, interactive mode

## Phases

### Phase 1: Heartbeat, Endpoint, and Footer Display

**Goal:** Agent containers emit heartbeats to Redis, the backend exposes a live count endpoint, and the terminal footer renders the count with correct visual states.

**Requirements:** AGENT-01, AGENT-02, AGENT-03, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06

**Plans:**
1. Agent heartbeat — add UUID-based `SETEX` heartbeat coroutine to `agent/app/main.py` with exception isolation and `return_exceptions=True` on the gather call
2. Backend count endpoint — add `GET /api/agent/count` to `backend/app/routers/agent.py` using `scan_iter("agent:heartbeat:*")`
3. Frontend hook and footer UI — implement `useAgentCount` hook with 15s polling and null initial state; render second dot + label in `ChatTerminal.tsx` footer using design system colors

**Success Criteria:**
- [ ] Running one agent container and hitting `GET /api/agent/count` returns `{"count": 1}`; stopping the container causes the count to drop to 0 within 30 seconds
- [ ] Terminal footer shows a green dot + "1 AGENT" label when one agent is live, red dot + "0 AGENTS" when none are, and neutral dot with no label before the first successful fetch
- [ ] Killing Redis mid-run does not crash the agent worker — command execution continues and heartbeat errors are swallowed silently
- [ ] A failed `GET /api/agent/count` fetch in the frontend does not reset the displayed count to 0 — the previous value is retained
- [ ] `redis-cli SCAN 0 MATCH "agent:heartbeat:*"` returns one key per running agent and zero keys within 30s of all agents stopping

---
*Created: 2026-03-28*
