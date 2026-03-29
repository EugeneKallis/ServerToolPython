---
phase: quick
plan: 260329-du9
subsystem: frontend
tags: [modal, terminal, ux, components]
tech-stack:
  added: []
  patterns: [fixed-overlay-modal, useEffect-cleanup, event-stopPropagation]
key-files:
  created:
    - frontend/app/components/TerminalOutputModal.tsx
  modified:
    - frontend/app/components/ChatTerminal.tsx
decisions:
  - Used fixed inset-0 z-50 overlay with stopPropagation on inner panel for backdrop-click close
  - Body overflow hidden managed via useEffect with cleanup to prevent scroll lock on close
  - Modal rendered inside ChatTerminal component tree (not a portal) for simplicity
metrics:
  duration: 66s
  completed: "2026-03-29"
  tasks_completed: 2
  files_changed: 2
---

# Phase quick Plan 260329-du9: Full-Screen Terminal Output Modal Summary

**One-liner:** Full-screen text viewer modal for terminal output boxes using fixed overlay, line numbers, and three close triggers (X, backdrop, ESC).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create TerminalOutputModal component | 7cc072c | frontend/app/components/TerminalOutputModal.tsx |
| 2 | Wire modal into ChatTerminal output boxes | a8b9409 | frontend/app/components/ChatTerminal.tsx |

## What Was Built

### TerminalOutputModal (`frontend/app/components/TerminalOutputModal.tsx`)

A `'use client'` React component that renders a full-screen overlay when a terminal output block is clicked. Features:
- Fixed full-screen overlay with `bg-black/70 backdrop-blur-sm`
- Near-full-screen inner panel with `bg-surface-container-lowest border border-outline-variant`
- Header bar shows `$ {command}` in `text-primary-fixed-dim font-mono text-xs` with X close button
- Scrollable content area with line numbers (left column, `text-outline select-none text-[11px] w-8 shrink-0 text-right`) and output text (`whitespace-pre-wrap font-mono text-[12px] text-on-surface-variant leading-relaxed`)
- Three close triggers: X button, backdrop click (via `stopPropagation` on inner panel), ESC key
- Body scroll lock via `useEffect` that sets `document.body.style.overflow = 'hidden'` and cleans up on unmount

### ChatTerminal changes

- Imported `TerminalOutputModal`
- Added `expandedOutput` state: `{ lines: string[]; command?: string } | null`
- Agent output div now has `cursor-pointer hover:border-primary-fixed-dim/50 transition-colors` + `onClick` + `title="Click to expand"`
- Modal rendered in component tree before Footer, controlled by `expandedOutput` state

## Verification

- `npx tsc --noEmit` passes (only pre-existing `next.config.ts` error from `@ducanh2912/next-pwa` missing type declarations — out of scope)
- All new code is type-safe with no new TypeScript errors

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `frontend/app/components/TerminalOutputModal.tsx` — EXISTS
- `frontend/app/components/ChatTerminal.tsx` — EXISTS (modified)
- Commit 7cc072c — confirmed in git log
- Commit a8b9409 — confirmed in git log
