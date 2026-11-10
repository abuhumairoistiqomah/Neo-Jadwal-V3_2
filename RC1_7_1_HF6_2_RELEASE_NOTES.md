# E-JADWAL V3.20 RC1.7.1 HF6.2 — Inline Public Teaching Team Tasks

Baseline: RC1.7.1 HF6.1. **Staging candidate**; no live Supabase/PostgreSQL test or full `npm ci`/`tsc`/Vite build was available in the packaging environment.

## Why
- HF6/HF6.1 placed teaching team tasks in an extra green panel, duplicating lesson cards.
- Public/guest read via `ejadwal_public_schedule_snapshot_v3` limited task content to the current/future Jakarta school date, while admin fetched all task rows. As a result, a selected historical class session could show tasks to admin but not to a teacher using the public view.

## Fix
- Remove the independent **Tugas untuk Teaching Team** panel on Dashboard Guru.
- Display each permitted team task **inside its normal class/JP schedule card** with the existing **Lihat Kegiatan Siswa / Tugas** modal; no extra badal, timetable slot, duty, menu, or learning-task record is inserted.
- Preserve candidate eligibility checks for class, exact date, JP, operational teaching team, leave/conflicts, active academic calendar, and ASSIGNED/COMPLETED or verified NO_SUBSTITUTE. Substitutes still see the normal badal card; absent teachers do not receive team tasks.
- If a legacy teacher filter hides the valid lesson row, retain the **canonical existing class lesson** in the JP card list once, not an independent task-only card.
- Add **public read RPC v4**, inheriting sanitized v3 contact rules but making non-cancelled, non-deleted instructional tasks/resources readable on older selected dates as well as future ones. This does not permit changes to tasks or broaden direct table privileges. Private leave reasons are not included in the public projection.

## CRITICAL privacy/visibility scope
The site is reachable via a public URL: ANYONE with access to the site may read the instructional description and links exposed by this RPC, not only an individually authenticated school employee. This is intentional for this workflow, but **do not attach confidential student records, private staff details, or restricted materials** to tasks. Google Drive file permissions remain independent of E-Jadwal and should be checked by school administration.

## Changed paths
- `src/components/Dashboard.tsx`
- `src/domain/schedule/teamTeachingTask.ts`
- `src/infrastructure/repositories/supabasePublicScheduleRepository.ts`
- `src/__tests__/v3-20-rc1-7-1-hf5-team-badal-task.test.ts`
- `src/__tests__/v3-20-rc1-7-1-hf6-teacher-dashboard-tasks.test.ts`
- `src/__tests__/v3-20-rc1-7-1-hf6-2-inline-public-team-task.test.ts` (new)
- `src/__tests__/v3-14-6-rc3-4-8-supabase-only-guest.test.ts`
- `src/__tests__/v3-14-6-rc3-4-8-2-public-badal-task-visibility.test.ts`
- `src/__tests__/v3-14-6-rc3-4-8-3-dated-public-wa.test.ts`
- `package.json` (include new regression in test and test:320)
- `supabase/migrations/202611110001_v3_20_rc1_7_1_hf6_2_public_team_tasks.sql` (new)
- `supabase/verifiers/202611110001_v3_20_rc1_7_1_hf6_2_readonly_verifier.sql` (new)

## Deploy staging (required order)
1. Back up current Supabase and source. Apply the NEW SQL migration in Supabase staging **before** publishing frontend HF6.2. Existing v1-v3 functions remain untouched.
2. Run read-only verifier and check `v4_exists`, `anon_can_execute` and task counts. Do not accidentally run verifier as a migration.
3. Apply PATCH HF6.1 -> HF6.2, or use PERSONAL/SHAREABLE HF6.2.
4. Execute:

```bat
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

On an existing working `node_modules`, step `ci` is optional.

5. In guest mode (Admin Mode OFF), select the date of an actual past badal. Verify original substitute sees their badal task; each available teaching team colleague sees the **same text and link within the existing class JP card**; no additional green panel.
6. Verify the same date in admin mode and compare. Check unrelated classes, wrong JP, an absent peer, and a canceled assignment; they must not inherit another class task.
7. Check that old dates do not reveal dated teacher phone numbers or private leave reasons. Test updated task text after refresh.

## Verification performed during packaging
- 43/43 focused Node unit/contract tests passed (including prior guest, HF5/HF6 and Team Teaching checks).
- Modified TS/TSX passed TypeScript transpilation parsing.
- `npm ci --offline` was not possible: npm cache lacked `@supabase/supabase-js`. Thus full lint, full tests and production build are NOT claimed as verified.

## Rollback
Rollback frontend to HF6.1 and switch the guest repository RPC from v4 back to v3; the new public v4 SQL function can be left unused or revoked per school policy. Be mindful: HF6.1 has the separate green panel and public-historical-date task gap.
