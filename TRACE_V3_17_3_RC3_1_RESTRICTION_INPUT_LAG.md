# E-JADWAL V3.17.3 RC3.1 — Aturan Guru Badal Input Lag Fix

Based on V3.17.3 RC3. **Frontend-only hotfix. No SQL migration.**

## Root cause (confirmed by code inspection)

`SubstituteConstraintAdmin.tsx` held `reason`, teacher/date/JP selection, and the full restriction overview in one React component. Every `setReason()` rerendered the entire page. For each displayed active official-duty restriction, the list called `needsFor()`, which calls `findOfficialDutyNeeds()` and rebuilds `buildEffectiveScheduleForDate()` over the full timetable. This is CPU work on the main browser thread, unrelated to editing a reason string. The original page also re-evaluated the active duty modal calculations unconditionally.

## Changes

1. Extracted `SubstituteConstraintEditor` **within the same source file** as a dedicated child React component. All form state is local to this child and does not update parent on keystrokes. Selectors, checkbox dependencies, Edit, Cancel Edit, and Save behavior are preserved.
2. A successful Save still uses `OperationalRulesRepository.saveSubstituteConstraint()` with the exact original fields and `id` of any row under edit. It resets the form only after the save succeeds, then reloads rows and calls `onChanged`.
3. Memoized `currentNeeds`, `currentAssignments`, and `currentCoverage` for the official-duty modal so changing unrelated UI does not recalculate the effective timetable.
4. Memoized `displayedRules`, `pastRulesCount`, and `coverageByRule`. The list calculates coverage only when relevant schedules/restrictions/assignments or the history filter change, and only for currently displayed restrictions.
5. Added regression test `src/__tests__/v3-17-3-rc3-1-restriction-typing.test.ts`.

## What remains intentionally unchanged

- `findOfficialDutyNeeds()` implementation and official-duty coverage rules
- Supabase repositories, RPCs, RLS and database schema
- Restriction hard/soft-block semantics
- JP0 through JP6 and full-day controls
- Badal assignments and official-duty persistence
- The approved-leave/teacher-duty resolution introduced in RC1

## Verification performed

- Focused restrictions and official-duty tests: **27/27 passed**.
- Broad tests using an alternative TypeScript runner: **312/312 assertions passed across 46 loaded test files**. The remaining **27 test files could not be loaded** with the alternative runner due to environment/dependency/ESM limitations. This is not a substitute for the project's normal `npm.cmd test`.
- 227 `.ts`/`.tsx` source files passed TypeScript syntax parsing (excluding declaration files).
- Full `npm.cmd run lint` and `npm.cmd run build` not performed because this environment lacks project `node_modules`.
- No measured performance improvement claim until tested in an actual production-build browser with React Profiler / Chrome Performance.

## Installation and smoke test

1. Back up the working RC3 source, preferably in Git.
2. For the **patch ZIP**, extract its `src/` tree over the project's `src/` tree (project ROOT), overwriting only matching files.
3. No `npm.cmd ci` or `npm.cmd install` needed if the existing dependencies already work. No Supabase SQL migration.
4. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
5. In staging, open **Aturan Guru Badal** with a long list of existing constraints and type 30–50 characters rapidly in **Alasan / Kegiatan**.
6. Verify selection of teacher, DATE/WEEKLY, JP range, the two checkbox dependencies, Add, Edit, Cancel Edit, Refresh, Show Past, and 'Tentukan Badal' coverage and assignment results.
7. Compare typing latency before/after in the same browser/device and on a production build. If noticeable lag remains across other pages, capture a Chrome Performance trace; potential parent-wide context rerenders remain separate candidates.

**Status: RC3.1 targeted staging hotfix. Not production-stable until real browser regression checks pass.**
