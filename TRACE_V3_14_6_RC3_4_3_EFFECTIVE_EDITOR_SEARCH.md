# TRACE V3.14.6 RC3.4.3 — Effective-date editor warnings + searchable dropdowns

**Base:** V3.14.6 RC3.4.2. **Status:** release candidate, needs full Windows npm gates and staging browser validation.

## Fix 1 — dated availability instead of raw master

- Both `ScheduleQuickEditor` (Hanya Tanggal Ini) and `IncidentalScheduleAdmin` now rank teachers against `buildEffectiveScheduleForDate` for the selected school date.
- Includes matching `Jadwal_Insidental`, `Log_Izin` (absences/substitutes), and `Kalender_Akademik` (class/JP cancellation). Rows marked `isActive=false` are excluded from teacher-conflict warnings and room preview.
- Quick Edit in permanent/master mode **continues to rank against master**. Switching to Hanya Tanggal Ini initializes subject, teacher, and room from the effective row on that date; switching back restores master, preventing accidental permanent mutation from a dated override.
- Conflicts for teachers still genuinely occupied remain warnings with confirmation. Actual DB constraints remain unchanged; this patch does not weaken Supabase RLS or database validation.

## Fix 2 — searchable dropdown

- Reusable `SearchableSelect` UI allows typing to filter matching names, keyboard Up/Down/Enter/Escape and scrollable results. It returns canonical IDs, not typed free text.
- Applied to teacher, class, room, day, JP, and rotation pattern where relevant to Quick Edit / Jadwal Insidental.
- Other unrelated modules keep their existing controls in RC3.4.3 to reduce rollout risk; reusable UI is available for subsequent global adoption.

## Diff / deployment

No SQL migration, Code.gs, Supabase keys, or env changes in RC3.4.3. All RC3.4.2 prerequisites remain, **including migration `202610110052_v3_14_6_calendar_bulk_versioning.sql` for that version's bulk-calendar capability**.

### Required Windows release checks

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

### Browser smoke tests

1. Dashboard → Quick Edit Senin 12 Oct 2026 JP2. Choose **Hanya Tanggal Ini**. A teacher with an 08 AE class cancelled by Rumah Tahfidz on that date must be shown as available. Same teacher must be busy on an ordinary Monday if that master class runs.
2. Change date within Quick Edit and verify availability changes immediately. Select an existing dated incidental and verify subject, room and teachers start from the effective date.
3. Switch to Ubah Jadwal Tetap and ensure it restores master values, not dated overrides.
4. Assign a teacher with an active unrelated class on the date; conflict warning must still display.
5. With teacher, room and class dropdowns, type a distinctive partial word, click matching result, try ArrowDown/Enter, and verify canonical selection persisted after save/refresh.
6. Recheck `Jadwal Insidental` and `Kalender Akademik` bulk operation. No UI read should modify master data.

### Validation performed in build environment

- TS/TSX syntactic parse: 165 files PASS.
- New domain tests: 5 PASS (master occupied, calendar cancellation, dated teacher replacement, izin/badal, UI wiring).
- Available alternative suite: 226 tests PASS; several other test modules could not load through the CJS-only fallback runner (ESM `import.meta`, missing modules). This is **not** a full npm test result.
- Domain TypeScript compile for changed domain helpers PASS.
- Full React/Vite typecheck/build and live Supabase smoke **not run** here because npm dependencies are not installed.
