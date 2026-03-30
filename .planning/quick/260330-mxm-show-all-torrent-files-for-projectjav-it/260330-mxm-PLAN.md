---
phase: quick
plan: 260330-mxm
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/app/scraper/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "projectjav cards show all torrent files in a compact list in the footer"
    - "Each file row displays file_size, S:seeds, L:leechers with its own Download and -C buttons"
    - "Each file has independent loading/done/error state"
    - "Keyboard shortcut d/Enter downloads the best file (most seeds, then largest)"
    - "After downloading any file, item is marked downloaded but NOT auto-hidden"
    - "Non-projectjav sources continue to work exactly as before"
  artifacts:
    - path: "frontend/app/scraper/page.tsx"
      provides: "Multi-file ItemCard for projectjav source"
      contains: "bridgeStates"
  key_links:
    - from: "ItemCard file list"
      to: "/api/magnet-bridge/add"
      via: "per-file sendToBridge with file-specific magnet_link"
      pattern: "sendToBridge.*file"
---

<objective>
Show all torrent files for projectjav items with size, seeds, leechers and individual download buttons.

Purpose: projectjav items often have multiple torrent files with different quality/size. Users need to see all options and pick the one they want, not just the auto-selected "best" file.
Output: Updated ItemCard component in scraper page with per-file rows and independent download states.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/app/scraper/page.tsx
@frontend/design/code.html

<interfaces>
<!-- Current types and functions in scraper/page.tsx the executor needs -->

```typescript
interface ScrapedFile {
  id: number;
  magnet_link: string;
  file_size: string | null;
  seeds: number | null;
  leechers: number | null;
}

interface ScrapedItem {
  id: number;
  title: string;
  image_url: string | null;
  magnet_link: string;
  torrent_link: string | null;
  tags: string | null;
  source: string;
  is_hidden: boolean;
  is_downloaded: boolean;
  created_at: string;
  files: ScrapedFile[];
}

function bestFile(files: ScrapedFile[]): ScrapedFile | null;
// Sorts by file_size desc, then seeds desc. Returns top result.

function ItemCard({ item, isActive, onHide }: {
  item: ScrapedItem;
  isActive: boolean;
  onHide: (id: number) => void;
}): JSX.Element;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor ItemCard for per-file state and multi-file rendering</name>
  <files>frontend/app/scraper/page.tsx</files>
  <action>
Modify the ItemCard component in `frontend/app/scraper/page.tsx`:

1. **Update `bestFile` sort order**: Change to sort by seeds descending FIRST, then file_size descending as tiebreaker. This matches the user requirement "most seeds, then largest".

2. **Replace single `bridgeState` with per-file state map**:
   - Change `const [bridgeState, setBridgeState] = React.useState<...>('idle')` to:
     `const [bridgeStates, setBridgeStates] = React.useState<Record<number, 'idle' | 'loading' | 'done' | 'error'>>({})`
   - Helper: `const getState = (fileId: number) => bridgeStates[fileId] ?? 'idle'`
   - Helper: `const setState = (fileId: number, s: ...) => setBridgeStates(prev => ({ ...prev, [fileId]: s }))`

3. **Refactor `sendToBridge` to accept a specific file**:
   - Signature: `sendToBridge(magnetLink: string, fileId: number, downloadUncached: boolean)`
   - Use `getState(fileId)` / `setState(fileId, ...)` instead of single bridgeState
   - On success: call PATCH `/api/scraper/items/${item.id}/downloaded` but do NOT call `onHide` or setTimeout to hide. Just mark downloaded.
   - On error: setState to 'error', setTimeout 3s to reset to 'idle'

4. **Keyboard shortcut** (`d`/`Enter`): keep working for active card. It should call `sendToBridge` with the best file's magnet_link and file id. Guard: if best file's state is loading/done, ignore.

5. **Footer rendering — branch by source**:

   **For `projectjav` items with `item.files.length > 0`:**
   - Keep the title row as-is (truncated, mono, line-through if downloaded)
   - Below title, render a compact file list. Each file row is a flex container:
     ```
     <div className="flex items-center gap-2 text-[10px] font-mono">
       <span className="text-primary-fixed-dim shrink-0">{file.file_size ?? '?'}</span>
       <span className="text-outline shrink-0">S:{file.seeds ?? 0}</span>
       <span className="text-outline shrink-0">L:{file.leechers ?? 0}</span>
       <div className="flex items-center gap-1.5 ml-auto">
         [Download button] [−C button]
       </div>
     </div>
     ```
   - Download/−C buttons per row: same styling as current buttons but smaller (px-2 py-1). Use `getState(file.id)` for disabled/label. On click call `sendToBridge(file.magnet_link, file.id, false/true)`.
   - Button label: show icon only (Download icon 12px), with state indicator text (... / checkmark / X) in a tiny span.
   - If file list has more than 5 entries, add `max-h-[160px] overflow-y-auto` to the file list container.
   - Separate file rows with a subtle `border-b border-outline-variant/30 last:border-0` on each row, `py-1` padding.

   **For non-projectjav items (or projectjav with no files):**
   - Keep the existing single-button footer layout exactly as-is, but use per-file state keyed by `0` (a fallback key since there's no file id). This keeps the code unified.

6. **Hide button**: remains unchanged at the bottom of the actions area, same position for all sources.

7. **Tags**: keep the existing tag display between title and file list (for projectjav) or in the actions row (for other sources).

Design tokens to use (from design system):
- File row text: `text-outline` for seeds/leechers, `text-primary-fixed-dim` for file size
- Button borders: `border-outline-variant`
- Hover states: `hover:bg-surface-container-high`
- Row separator: `border-outline-variant/30`
  </action>
  <verify>
    <automated>cd /Users/ponzi/dev/ServerToolPython/frontend && npx next build 2>&1 | tail -5</automated>
  </verify>
  <done>
    - projectjav ItemCard shows all files as individual rows with size/seeds/leechers
    - Each file row has independent Download and -C buttons with independent loading state
    - Keyboard d/Enter still downloads best file (most seeds first)
    - Downloading a file marks item as downloaded but does not auto-hide
    - Non-projectjav cards render exactly as before
    - Build succeeds with no TypeScript errors
  </done>
</task>

</tasks>

<verification>
- `cd frontend && npx next build` completes without errors
- Visual inspection: projectjav cards show file list with per-file buttons
- Test keyboard: d/Enter on active projectjav card triggers best file download
- Test: downloading one file does not hide the card
- Test: non-projectjav cards unchanged
</verification>

<success_criteria>
projectjav items display all torrent files in a compact list with file_size, seeds, leechers, and individual Download/-C buttons. Each button has independent state. Keyboard shortcuts work on best file. Cards stay visible after download.
</success_criteria>

<output>
After completion, create `.planning/quick/260330-mxm-show-all-torrent-files-for-projectjav-it/260330-mxm-SUMMARY.md`
</output>
