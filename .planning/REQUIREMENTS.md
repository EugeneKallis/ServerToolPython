# Requirements: Agent Count Display

**Defined:** 2026-03-28
**Core Value:** Commands dispatched from the UI must execute reliably on agent containers and stream output back in real time.

## v1 Requirements

### Agent Heartbeat

- [ ] **AGENT-01**: Each agent worker writes `SETEX agent:heartbeat:<uuid> 30 1` to Redis every 10 seconds as a background coroutine alongside existing command execution
- [ ] **AGENT-02**: Heartbeat exceptions are caught internally (try/except) and never propagate to cancel command execution; `asyncio.gather` uses `return_exceptions=True`
- [ ] **AGENT-03**: Backend exposes `GET /api/agent/count` that scans `agent:heartbeat:*` keys (using `scan_iter`, not `KEYS`) and returns `{"count": N}`

### UI Display

- [ ] **UI-01**: Terminal footer shows a second dot + agent count label inline after the connection status dot, separated by a `·` divider
- [ ] **UI-02**: Before first successful fetch, dot is neutral (`bg-outline`) with no count label (null loading state — no flash of "0 agents")
- [ ] **UI-03**: When count ≥ 1, dot is green (`bg-primary-fixed-dim`) and label reads "1 AGENT" or "N AGENTS" (singular/plural)
- [ ] **UI-04**: When count is confirmed 0 (successful response returns 0), dot is red (`bg-error`) and label reads "0 AGENTS"
- [ ] **UI-05**: On fetch errors, the previous count value is retained — state is never reset to 0 on a failed request
- [ ] **UI-06**: `useAgentCount` hook at `frontend/app/hooks/useAgentCount.ts` polls `GET /api/agent/count` every 15 seconds and returns `number | null`

## v2 Requirements

### Future Enhancements

- **AGENT-V2-01**: Per-agent identification — display individual agent IDs or names
- **AGENT-V2-02**: Agent-specific command routing (target commands to a specific agent)
- **AGENT-V2-03**: Agent health details (uptime, current task status per agent)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-agent naming/identification | Not requested; count only for v1 |
| Agent-specific command routing | Requires significant BRPOP architecture changes |
| WebSocket push for count updates | Unnecessary coupling; 15s poll is sufficient for container lifecycle events |
| Agent restart/stop controls | Separate feature, not part of this request |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGENT-01 | Phase 1 | Pending |
| AGENT-02 | Phase 1 | Pending |
| AGENT-03 | Phase 1 | Pending |
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 1 | Pending |
| UI-04 | Phase 1 | Pending |
| UI-05 | Phase 1 | Pending |
| UI-06 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after initial definition*
