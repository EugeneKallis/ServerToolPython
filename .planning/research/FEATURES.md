# Features Research: Agent Count Display

## Table Stakes (expected behavior)

Users monitoring a worker pool expect:

- A count that reflects reality within a few seconds — not a staleness window longer than the heartbeat TTL
- A clear visual distinction between "no agents" (problem) and "at least one agent" (nominal)
- No modal dialogs, toasts, or interruptions — count is ambient status, not an alert
- Graceful handling of the period between page load and first data: a neutral loading state, not a flicker to "0 agents" before the fetch completes
- The indicator must not compete with the primary status dot (connected/disconnected) — it is secondary information

## Display States

| State | Trigger | Display |
|-------|---------|---------|
| Loading | First render, before initial fetch returns | `● —` (neutral/dim dot, em dash or no count) |
| 0 agents | Count endpoint returns 0 live heartbeat keys | `● 0 agents` (red/error dot) |
| 1 agent | Count returns 1 | `● 1 agent` (green dot, singular) |
| N agents | Count returns N > 1 | `● N agents` (green dot, plural) |
| Error | Fetch fails or network unreachable | Omit the indicator entirely, or show `● —` same as loading — do not show a count of 0 that conflates a fetch error with "no agents running" |

Key distinction: **0 agents is a legitimate value** (all containers down), not a fetch error. The UI must not treat them identically. A failed fetch should silently fall back to the previous known value or hide the indicator; it should not flash 0.

## Visual Design Patterns

**Dot color logic**

The existing footer uses three colors from the design system for the connection dot:
- `bg-primary-fixed-dim` (`#00e38a` family) — connected / nominal
- `bg-tertiary-fixed-dim animate-pulse` — connecting / transitional
- `bg-error` (`#ffb4ab`) — disconnected / problem

Apply the same palette to the agent count dot:
- `bg-primary-fixed-dim` when count >= 1
- `bg-error` when count === 0 (confirmed, not error state)
- `bg-outline` (neutral gray) when loading or fetch error — this color is already used for the footer text and reads as "inactive, not yet known"

**Text format**

Follow the existing footer text conventions exactly:
- `font-mono text-[9px] uppercase tracking-widest text-outline`
- Singular/plural: `1 AGENT` / `N AGENTS`
- Loading: `— AGENTS` or omit the number entirely (`AGENTS —`)
- No label prefix beyond the count — keep it as short as the existing `connected` text

**Placement**

Insert the agent count as a second `<span>` on the left side of the footer, immediately after the connection status span, separated by a visual divider that already exists in the design system — a `·` separator or a `|` pipe matching the right-side `environment · dockerTag` pattern:

```
● connected  ·  ● 3 agents          dev · latest
```

This mirrors the existing right-side separator pattern (`{environment} · {dockerTag}`) and keeps both left-side indicators grouped without adding a new layout region.

The design system's header shows `LIVE_NODES: 12` with `bg-surface-container-highest` pill styling as an alternative pattern, but that is too heavy for a footer — the inline dot+text matches the existing footer style exactly.

## Data Delivery

**Polling is correct here.** The PROJECT.md key decisions table explicitly chose polling over WebSocket push ("count doesn't need sub-second latency"). The reasoning holds:

- Agent count changes slowly (container starts/stops), not at message frequency
- Adding a new WebSocket message type requires coordinating backend subscriber logic, frontend TerminalContext message handling, and the agent heartbeat publisher — all for a number that changes maybe once per deployment
- A simple `GET /api/agent/count` polled every 15–30 seconds is zero-overhead on the WebSocket path and trivially cacheable at the backend (it's just `KEYS agent:heartbeat:*` or `SCAN` + count)
- The existing WebSocket is already used for terminal output; multiplexing status data onto it couples concerns that have different lifecycles

**Recommended polling interval: 15 seconds.** The heartbeat TTL will be 30 seconds (`SETEX agent:heartbeat:<id> 30 1`). Polling at half the TTL means in the worst case the UI is one poll cycle stale when a new agent comes up. For agent teardown, the key expires automatically — the UI sees 0 within one poll cycle after the TTL window. 15s lag is imperceptible for a count display.

**React implementation pattern:**

```ts
const [agentCount, setAgentCount] = useState<number | null>(null);

useEffect(() => {
  let cancelled = false;
  const fetchCount = async () => {
    try {
      const res = await fetch('/api/agent/count');
      if (!res.ok) return; // silent fail, keep previous value
      const data = await res.json();
      if (!cancelled) setAgentCount(data.count);
    } catch {
      // network error — do not reset to null, keep last known value
    }
  };
  fetchCount();
  const id = setInterval(fetchCount, 15_000);
  return () => { cancelled = true; clearInterval(id); };
}, []);
```

Initial state `null` = loading. The fetch error path deliberately keeps the previous value rather than resetting to `null` or `0` — this is the critical pattern to avoid false "0 agents" flicker on transient network blips.

## Anti-features

**Do not add:**

- A tooltip or hover card explaining what "agents" are — the audience (operators) already knows
- Click behavior on the count — it is a display only, not a link to an agent management page (that's Out of Scope per PROJECT.md)
- An animation or color pulse on count change — the connection dot already pulses during `connecting`; adding more animation to the footer makes it noisy
- A "last updated" timestamp next to the count — unnecessary for a 15s poll interval
- Separate error state styling (a third dot color for "fetch failed") — this overcomplicates a footer indicator; silent fallback to last known value is sufficient
- Real-time SCAN on every WebSocket message — the agent count does not belong in the hot path of terminal output streaming
- Caching the count in Redux/Zustand — local `useState` + `useEffect` in the footer component is the correct scope; global state is unnecessary for a single display element
- Any layout changes that shift the environment/dockerTag right-side content — it must remain right-aligned as-is
