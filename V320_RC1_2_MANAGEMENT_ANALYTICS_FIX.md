# E-JADWAL V3.20 RC1.2 — Management Analytics Category Sync

Baseline: V3.20 RC1 plus RC1.1 `ApprovedLeaveMaintenanceAdmin.tsx` state hotfix.

## Observed and reproduced

1. Official school duty (`OFFICIAL_DUTY`) can appear as 2 JP in Individual Statistics but 0 in the management V3.18 legacy `leave_jp` field. The latter explicitly excludes official duty.
2. Category dropdown in RC1 affected only the aggregate category cards, not the teacher table or CSV.
3. Designated teacher placeholder `Guru belum ditentukan` was included as a real person in teacher rows.

## Changes

- Historical rows with a missing `absent_teacher_id` are resolved by a **unique** normalized full-name match; duplicate-name collisions are deliberately not guessed. Official-duty rows can use their linked `substitute_constraints.teacher_id` as identity provenance.
- New staff-only SQL RPC `ejadwal_leave_category_teacher_activity_v320(date,date)` returns per-teacher categorical JP/hari, including an `ALL` grouping calculated directly from deduplicated teacher+date+JP units.
- The existing category summary RPC now excludes the designated dummy teacher, and individual profile RPC reads historical-import categories if the manual historical integration had not been run before.
- Management Analytics combines **effective teaching** from V3.18 with **unavailable-to-teach JP/day** from the new V3.20 per-teacher RPC. No fake teaching hours are awarded for school duty.
- Selecting PERSONAL/SCHOOL_DUTY/UNCLASSIFIED filters affected teachers and recalculates JP/day/ratio, sorting and exported CSV. ALL includes all legitimate teachers even if their affected JP is zero.
- Placeholder `Guru belum ditentukan` is hidden from management teacher table, CSV and category totals (data remain intact). The old top-level operational summary KPIs from V3.14 remain unfiltered by category, deliberately preserving their separate semantics.
- No change to leave requests, classified historical records, substitution assignments or lesson tasks.

## Install order

1. Backup/staging first. Ensure V3.20 RC1 and historical coverage category backfill have been applied.
2. Open SQL Editor (privileged) and run `supabase/migrations/202610230001_v3_20_rc1_2_management_category_activity.sql` **once**.
3. Run `ops/verifiers/v320_rc1_2_management_category_readonly.sql`.
4. Apply the patch files to V3.20 RC1.1 (or extract a full source release).
5. On PC: `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`, then `npm.cmd run dev`.
6. Management Analytics: choose October 2026, search DINSYA, test School Duty vs Personal vs All. Confirm placeholder is absent in ALL and filtered exports. Inspect for category RPC permission failures.

## Checks performed locally

- 25 focused tests: PASS (including source-compatible V3.14/V3.18 tests, new category tests, V3.20 tests).
- Domain TypeScript-only checking: PASS.
- Full browser build, live SQL migration and live Dinsya database result **not validated** in this environment due to missing runtime node_modules and no Supabase connection.

## Notes

- The title "JP Tidak Mengajar" measures recorded unavailability from instructional duties, **not physical attendance**.
- For days with both Personal and School Duty, days may overlap across separate category filters; ALL counts the day once.
- Leaving a personal leave on a teacher/date/JP takes precedence over official duty for that same unique key in the category aggregate.
- Placeholder exclusion is deliberately restricted to named dummy teacher metrics. It does not delete coverage slots or silently alter existing management summary KPIs.
- This patch intentionally does not replace `.env.local` or `package-lock.json`; the dependency lockfile still needs separate verification for a clean `npm ci`.
