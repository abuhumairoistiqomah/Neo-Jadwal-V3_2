# E-JADWAL V3.18 RC2 — Teacher Analytics Table Navigation

## Baseline
Full Source V3.18 RC1. Version updated to `3.18.0-rc.2`. This release modifies UI navigation only; no database migration, analytics formulas, leave rules, duty resolver, or exported CSV semantics change.

## Changes
1. A bounded vertical scroll region (`max-height: min(58vh, 520px)`) for the *Beban Operasional Guru* table.
2. Sticky table header and sticky **Guru** column while scrolling vertically/horizontally.
3. Native horizontal scrollbar positioned **above** the sticky header, synchronized in both directions with the table's horizontal scrollbar.
4. Mouse pointer drag-to-pan horizontally on table data rows (minimum six-pixel movement). Sorting header and other interactive controls remain clickable; on touch/pen devices, scrolling remains native.
5. ResizeObserver measures the table and viewport widths; the top scrollbar appears only on overflow and updates on layout changes. Scrolling changes DOM `scrollLeft` without forcing React re-render on each movement.
6. Keyboard focus for top and table scroll regions (`tabIndex=0` + aria labels). Existing sortable headers and CSV export remain unchanged.

## Modified / added files
- `src/components/ManagementAnalytics.tsx` — scroll UI and mouse drag handling.
- `src/domain/tableNavigation.ts` — pure scroll-geometry helpers.
- `src/__tests__/v3-18-rc2-table-navigation.test.ts` — targeted tests (included in `npm test`).
- `package.json`, `package-lock.json` — version increment; test script includes new test file.
- `TRACE_V3_18_RC2_TABLE_NAVIGATION.md` — this document.

## Validation carried out
- 16/16 focused tests pass (5 V3.14 analytics, 6 V3.18 RC1, 5 V3.18 RC2) via a temporary isolated TypeScript compiler runner.
- 231 TS/TSX/JS source files pass TypeScript transpilation/syntax checks.
- ZIP archive integrity and baseline+patch parity checked.
- NOT validated here: full `npm test`, `npm run lint`/TypeScript typecheck, Vite build, and browser behavior with actual school data. npm offline installation was blocked by missing npm cached dependencies.

## Installation (V3.18 RC1 -> RC2)
Back up the current source; extract PATCH zip into the project root, preserving folders and overwriting files. Or use FULL SOURCE ZIP as a complete replacement. SQL migration is **not required**: retain the V3.18 RC1 database.

PowerShell:
```
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

## Browser smoke-test checklist
- Open Management Analytics -> *Beban Operasional Guru* with many teachers.
- Scroll down within the table: the header stays visible and the rest of the page does not scroll.
- Scroll horizontally with the top scrollbar: the teacher name remains frozen; the horizontal position matches the table below.
- Drag on a table data row left/right with a mouse: contents pan; clicking sortable headers still sorts in both directions.
- Resize the browser to narrow width: scrollbar remains usable and does not desynchronize.
- On mobile, swipe normally in both directions; verify no forced mouse-drag interference.
- Search a teacher, sort, and export CSV; confirm columns/numbers unchanged from RC1.

## Known limitation
No new backend calendar/KBM or staff-duty calculations are included. They remain planned for V3.19. Status: **RC2 staging candidate**, not production stable until browser testing and full npm checks pass.
