---
phase: quick-260329-g5y
plan: 01
subsystem: frontend
tags: [bug-fix, shell-history, chat-terminal, ux]
dependency_graph:
  requires: []
  provides: [fixed-shell-history-popup]
  affects: [frontend/app/components/ChatTerminal.tsx]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - frontend/app/components/ChatTerminal.tsx
decisions:
  - "Use input === '/shell ' || historyIndex >= 0 to keep popup visible during navigation"
  - "Cap both navigation (ArrowUp max index 4) and display (slice 0-5) consistently"
metrics:
  duration: "5 minutes"
  completed: "2026-03-29"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-260329-g5y Plan 01: Fix Shell History Popup Summary

**One-liner:** Fixed shell history popup staying visible during arrow-key navigation and capped display and navigation to 5 entries.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix shell history popup visibility, display cap, and navigation cap | ffa253e | frontend/app/components/ChatTerminal.tsx |

## Changes Made

### 1. Fixed `showShellSuggestions` condition (line 206)

**Before:**
```typescript
const showShellSuggestions = input.startsWith('/shell ') && input.length <= 8 && shellHistory.length > 0;
```

**After:**
```typescript
const showShellSuggestions = input.startsWith('/shell ') && shellHistory.length > 0 && (input === '/shell ' || historyIndex >= 0);
```

The original `input.length <= 8` check caused the popup to disappear the moment a command fills the input past 8 characters. The fix shows the popup when the user is actively navigating (`historyIndex >= 0`) regardless of input length.

### 2. Capped ArrowUp navigation to 5 entries (line 517)

**Before:**
```typescript
const next = Math.min(historyIndex + 1, shellHistory.length - 1);
```

**After:**
```typescript
const next = Math.min(historyIndex + 1, Math.min(shellHistory.length - 1, 4));
```

Limits navigation index to 0-4, matching the 5-entry display cap.

### 3. Capped popup display to 5 entries (line 836)

**Before:**
```typescript
{[...shellHistory].reverse().map((cmd, i) => {
  const histIdx = shellHistory.length - 1 - i;
```

**After:**
```typescript
{[...shellHistory.slice(0, 5)].reverse().map((cmd, i) => {
  const visibleCount = Math.min(shellHistory.length, 5);
  const histIdx = visibleCount - 1 - i;
```

Slices to the 5 most recent entries before reversing for display, and adjusts the `histIdx` calculation to use the visible count so highlighting stays correct.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript type check passes (`npx tsc --noEmit --skipLibCheck`) with no errors in application code.
- `npx next build` fails with `Cannot find module '@ducanh2912/next-pwa'` — this is a pre-existing local environment issue (module not installed), unrelated to these changes.

## Known Stubs

None.

## Self-Check: PASSED

- Modified file exists: `frontend/app/components/ChatTerminal.tsx` — FOUND
- Commit ffa253e exists: FOUND
