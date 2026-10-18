# TRACE ON — E-Jadwal V3.15 (candidate for staging)

Baseline: **V3.14.6 RC3.4.9.5**, no existing migrations rewritten.

## Scope

1. **Jadwal Lengkap Guru**: Jadwal Normal (canonical master) or Jadwal Insidental (dated effective schedule), with week navigation. Jakarta-local Saturday/Sunday defaults to **next** school week. PNG follows active mode and week; status markers show INSIDENTAL, BADAL, IZIN, TUGAS_RESMI, and KALENDER. Official-duty absence is never labeled personal izin. Reuses `buildEffectiveScheduleForDate`; doesn't auto-assume Syaikh Ali rotation.
2. **Auto-scroll editor**: Clicking Edit in Insidental or Aturan Guru Badal scrolls the actual editor section into view inside the active scroll container, not the page's `window.scrollTo(0,0)`.
3. **Aturan Guru Badal / Kebutuhan Badal**: Optional checkbox when normal teaching is blocked. `requires_badal` persists in `substitute_constraints`. DATE rules show number of actual dated instructional class/JP obligations; WEEKLY rules require choosing one concrete date. Only live, uncancelled teaching counts. Each slot can select an eligible substitute and save through staff-only `ejadwal_assign_official_duty_badal_v1`. Upon assignment the status is computed from persisted `coverage_slots`, not an optimistic client toggle. Complete dated rules show disabled **Badal Aman**. Reason is snapshotted exactly from rule on insert. No personal leave request is created, and the existing individual leave RPC excludes `OFFICIAL_DUTY` coverage from personal leave statistics. Logs and public effective schedule receive assigned coverage through existing Supabase mapper.

## SQL deployment

Migration: `supabase/migrations/202610170001_v3_15_official_duty_badal.sql`. Apply **after** last V3.14.6 migration in STAGING first. Backup production DB before production application.

- Adds two fields (`requires_badal`, `official_duty_constraint_id`), a new allowed coverage source `OFFICIAL_DUTY`, uniqueness protection, and one audited staff-only RPC. Existing master, leave workflow, and private reasons aren't rewritten.
- Server rechecks restriction validity/date/JP, active instructional assignment, cancellation by academic calendar, teacher identity, duplicate leave/coverage, and substitute constraints. Concurrent attempts constrained by unique index.
- Audit is in `audit_logs`. Editing the rule reason later does not retroactively edit existing reason snapshots.
- A restriction by itself **never** auto-creates coverage. A staff member confirms each substitute per dated class/JP, preventing phantom assignments.
- JP0 Homeroom is supported when teacher's canonical `wali_kelas` / `pendamping_kelas` maps to a class and, on the server, the teacher's `additional_task` and `notes` confirm that exact class. If data do not match, SQL fails closed (`OFFICIAL_DUTY_NO_ACTIVE_TEACHING`). Every affected class needs coverage; attendance JP0 still counts once in leave statistics (official duty is not a personal leave).
- Weekly, open-ended rules aren't marked globally complete: coverage is per selected date.

## Critical release checks

1. `npm.cmd ci` (or `npm.cmd install`), `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` on Windows with node_modules installed.
2. Guest/Admin matching effective timetable for same teacher and week, including a canceled event and replacement teacher.
3. Open Saturday: week defaults to next Monday. Check week back/forward and downloaded PNG header.
4. Click Edit near bottom on both admin screens: editor is scrolled into view.
5. In STAGING, create dated hard restriction with 'Guru tidak mengajar normal' and 'Kebutuhan Badal', reason `Panitia Survei Field Trip`. Confirm 2 of 3 slots only gives 2/3; after third gives 'Badal Aman'. Confirm `coverage_slots.source='OFFICIAL_DUTY'`, `leave_request_id is null`, name/reason snapshots correct, and no duplicate after reloading.
6. Confirm assigned official duty appears in Log Izin & WA and on effective schedule; it does **not** add new rows to personal leave statistic. Verify separately that Management Analytics operational coverage totals may still include official-duty coverage (this is legitimate substitution workload, not a personal leave request).
7. Confirm unavailable/date-mismatching or canceled-class cases fail closed. Review privileges and staff-only RPC from a guest session.
8. Deploy SQL + frontend in coordinated order; never push app first. Verify existing public RPC V3 still reads correctly.

## Validation limits

New focused TS/domain suite executed using global TypeScript transpile (no npm dependencies): **7/7 PASS**. TS/TSX parse validation completed. `npm ci --offline` fails due missing `@supabase/supabase-js` npm cache, so full suite/typecheck/Vite build and SQL execution in staging have **NOT** been verified in this environment. V3.15 must remain a staging candidate until they pass.
