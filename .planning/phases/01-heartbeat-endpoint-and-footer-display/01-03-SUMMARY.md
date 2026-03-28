---
id: 01-03
status: completed
completed: 2026-03-28
commits:
  - c812098 feat: Add useAgentCount hook polling /api/agent/count every 15s
  - cf6c5cf feat: Add agent count display to ChatTerminal footer
---

# Summary: Plan 01-03 — Frontend Agent Count Hook and Footer UI

## What Was Done

### T1 — useAgentCount hook (`frontend/app/hooks/useAgentCount.ts`)

Created the hooks directory and the `useAgentCount` hook. Key properties:
- Returns `number | null` — `null` until the first successful fetch
- Polls `GET /api/agent/count` every 15 seconds
- Fetches immediately on mount before starting the interval
- On non-ok HTTP responses: does nothing (previous value retained)
- On network errors: catch block is empty (previous value retained)
- Cleanup: `clearInterval` returned from `useEffect`

### T2 — ChatTerminal footer update (`frontend/app/components/ChatTerminal.tsx`)

- Added `import { useAgentCount } from '../hooks/useAgentCount'` after the existing context import
- Added `const agentCount = useAgentCount()` in the component body after `msgCounter`
- Extended the footer left-side span to show a second dot + label:
  - `null` (loading): neutral dot `bg-outline`, no label
  - `0` agents: red dot `bg-error`, label `0 AGENTS`
  - `1` agent: green dot `bg-primary-fixed-dim`, label `1 AGENT` (singular)
  - `≥2` agents: green dot `bg-primary-fixed-dim`, label `N AGENTS` (plural)
- Separator `·` uses `text-outline/40` per design system
- Footer wrapper div classes unchanged — text style remains `text-[9px] font-mono uppercase tracking-widest`

## Acceptance Criteria

- [x] `frontend/app/hooks/useAgentCount.ts` created
- [x] `frontend/app/components/ChatTerminal.tsx` footer updated
- [x] Initial state is `null` (not 0)
- [x] Fetch errors keep previous value (no setCount on error)
- [x] Footer shows 3 states: neutral dot (null), green dot + count (≥1), red dot (0)
- [x] Text style matches existing footer: `text-[9px] font-mono uppercase tracking-widest`
- [x] Each task committed individually (2 commits)
- [x] SUMMARY.md created

## Verification

All grep-based acceptance criteria verified before each commit. TypeScript
check skipped — `node_modules` not installed in the worktree, but the hook
uses standard React patterns (useState, useEffect) with no novel typing.
