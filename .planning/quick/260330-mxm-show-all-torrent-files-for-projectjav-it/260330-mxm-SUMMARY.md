---
phase: quick
plan: 260330-mxm
subsystem: frontend/scraper
tags: [ui, scraper, projectjav, torrent-files]
dependency_graph:
  requires: []
  provides: [per-file torrent download UI for projectjav items]
  affects: [frontend/app/scraper/page.tsx]
tech_stack:
  added: []
  patterns: [per-file state map with Record<number, BridgeStateValue>, IIFE in JSX for scoped logic]
key_files:
  created: []
  modified:
    - frontend/app/scraper/page.tsx
decisions:
  - bestFile sort changed to seeds desc first, file_size desc as tiebreaker (plan requirement)
  - Downloading a file does NOT auto-hide the card (plan requirement — user wants to download multiple files)
  - fileId=0 used as fallback key for non-projectjav items to keep state logic unified
metrics:
  duration: 159s
  completed: "2026-03-30"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick Plan 260330-mxm: Show All Torrent Files for projectjav Items Summary

**One-liner:** Per-file download UI for projectjav cards with independent loading states per row and seeds-first sort for best file selection.

## What Was Built

The `ItemCard` component in the scraper page was refactored to show all torrent files for projectjav items as individual rows in the card footer, each with its own size/seeds/leechers metadata and independent Download/-C buttons. Non-projectjav sources continue to use the original single-button layout.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor ItemCard for per-file state and multi-file rendering | 239a3f0 | frontend/app/scraper/page.tsx |

## Key Changes

- `bestFile` sort order changed: seeds desc first, then file_size desc as tiebreaker
- Single `bridgeState` replaced with `bridgeStates: Record<number, BridgeStateValue>` map
- `sendToBridge(magnetLink, fileId, downloadUncached)` now accepts per-file arguments
- On success: item is marked downloaded via PATCH but card is NOT auto-hidden
- projectjav cards with `item.files.length > 0` render a compact file list with per-row download buttons
- File lists with more than 5 entries get `max-h-[160px] overflow-y-auto`
- Keyboard `d`/`Enter` targets best file (most seeds → largest size)
- Non-projectjav cards use `fileId=0` as fallback key — behavior unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all file data is wired to live API responses from `item.files`.

## Self-Check: PASSED

- Modified file exists: `frontend/app/scraper/page.tsx` — confirmed
- Commit 239a3f0 exists — confirmed
- Build succeeded: /scraper route compiled without TypeScript errors (4.86 kB output)
