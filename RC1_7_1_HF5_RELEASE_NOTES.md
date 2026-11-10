# E-JADWAL V3.20 RC1.7.1 HF5 — Shared Badal Tasks for Teaching Teams

**Release type:** Frontend/domain hotfix from RC1.7.1 HF4. **Status:** Staging candidate.

## Requested behavior
When LALU, HAIKAL, ARIA, ALI are members of the same effective teaching team and LALU is replaced by YADIQ on a given class/date/JP:
- YADIQ keeps the existing badal assignment card with the instructional task.
- HAIKAL, ARIA and ALI see a **Tugas Badal — Informasi untuk Teaching Team** card with the *same* instructional description and resource links, on their existing schedule card for that class/date/JP.
- The task is view-only for the team. There is no extra substitute assignment, JP credit or task copy.
- The existing **NO_SUBSTITUTE / ditangani Team Teaching** behavior is unchanged.

## Technical changes
- Extended `findTeamTeachingTasksForTeacher` to accept only verified `NO_SUBSTITUTE` or valid `ASSIGNED` coverage.
- Used the effective schedule for exact date, JP, class and teacher roster; excluded cancelled calendar sessions, dated full-team replacements, unrelated classes, unavailable teachers, actual substitutes (whose badal card already has the task) and absent teachers.
- Updated the existing Dashboard task card title and modal label for `ASSIGNED` coverage.
- Preserved Native/Syaikh schedule filtering but kept a class card visible when the teacher is an eligible member of the team with a dated shared task.
- Added HF5 regression test and registered it in `npm test` and `npm run test:320`.
- Updated the older RC4.4 static test expectation for the new conditional task label.

## Changed files
- `src/domain/schedule/teamTeachingTask.ts`
- `src/components/Dashboard.tsx`
- `src/__tests__/v3-19-rc4-4-team-teaching-task.test.ts`
- `src/__tests__/v3-20-rc1-7-1-hf5-team-badal-task.test.ts` (new)
- `package.json`
- `RC1_7_1_HF5_RELEASE_NOTES.md` (new)

## Database and confidentiality
No new SQL migration or new table. Continues to read the existing `coverage_slots` + `learning_tasks` + `task_resources` through the existing public schedule projection. Guest view inherits its existing restriction to non-cancelled current/future coverage, not historical tasks. Task descriptions/resources displayed here were already visible in the substitute dashboard. Do not include sensitive leave reasons in teaching tasks.

## Local verification completed
- 15/15 tests passed: legacy RC4.4 and new HF5 dedicated tests (`node --experimental-strip-types --test ...`).
- 279 TypeScript/TSX/MTS source files parsed without syntax errors.
- `teamTeachingTask.ts` with `models.ts` passed a standalone TypeScript strict typecheck.
- Full project lint/build and Supabase integration were not verified here because dependencies are unavailable. Do not deploy directly to production without running local checks and staging UAT.

## Installation on the Snapdragon Windows device
### Patch (when working source is exactly HF4)
Extract HF5 PATCH into the project root (the folder containing `package.json`). Existing `.env.local` is not touched.

### Full Source PERSONAL
Contains the unchanged original `.env.local` from the supplied HF4 PERSONAL archive. Keep private; never upload or push this environment file.

### Full Source SHAREABLE
No `.env.local` and no personal credentials.

Run in CMD in project root:
```
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```
When node_modules already match package-lock.json, `npm.cmd ci` may be omitted; the other four checks remain recommended. **No SQL to run.**

## Staging UAT
1. Open a future active date with class+JP scheduled for LALU, HAIKAL, ARIA, ALI. Approve a test leave for LALU with instructional text/links; assign YADIQ as substitute.
2. Select YADIQ in Dashboard Guru: existing badal task must appear.
3. Select HAIKAL, ARIA, ALI in Dashboard Guru for same date: task card must appear on that same class/JP and open identical instructional text and links.
4. Select LALU: must not see a *team peer* card for their own leave; substitute assignment warning remains.
5. Test another JP/class and a colleague outside the team: no shared task card.
6. Set coverage to WAITING/CANCELLED, or cancel the class via academic calendar: no shared badal task card.
7. Edit the assignment task through the existing admin workflow, refresh dashboards, verify all see the updated text. Do not expect cross-browser live push; refresh current data after updates.
8. Verify legacy NO_SUBSTITUTE still works.

## Rollback
Restore HF4 source or reverse the PATCH. No database rollback is required.
