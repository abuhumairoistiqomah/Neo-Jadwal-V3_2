# E-JADWAL V3.20 RC1.7.1 HF6 — Dashboard Guru Team-Task Visibility

Status: **STAGING CANDIDATE**. Base: RC1.7.1 HF5. No SQL migration.

## Problem observed
HF5 correctly showed an absent member's badal task in Dashboard Kelas but the other active teaching-team members sometimes saw nothing in Dashboard Guru.

HF5 attached the task panel inside the **regular timetable card**. When that card was omitted by Native/Syaikh, schedule grouping or operational display filters, the task disappeared with the card. Moreover, helper logic recognized ASSIGNED but overlooked completed coverage (COMPLETED), a valid database status.

## Fix
- Dashboard Guru now renders a dedicated **Tugas untuk Teaching Team** panel directly beneath the teacher selector, independent of grouped regular lesson cards.
- Notices are resolved from the canonical dated effective class roster and the existing coverage/task projection. The substitute continues to see the original badal card, while other available team members can view the same task through the existing task modal.
- Accept valid ASSIGNED and COMPLETED coverage, and verified NO_SUBSTITUTE; do not show WAITING, CANCELLED, EXPIRED, unrelated classes or other teachers.
- Guard by exact class, date, JP, effective roster, absence, school-duty restrictions, calendar cancellation and priority conflicts. Deduplicate coverage IDs.
- No duplicate badal slots, no extra task rows, no change to Dashboard Kelas or the source-of-truth Supabase tables.

## Files changed since HF5
- src/components/Dashboard.tsx
- src/domain/schedule/teamTeachingTask.ts
- src/__tests__/v3-19-rc4-4-team-teaching-task.test.ts
- src/__tests__/v3-20-rc1-7-1-hf5-team-badal-task.test.ts
- src/__tests__/v3-20-rc1-7-1-hf6-teacher-dashboard-tasks.test.ts (new)
- package.json (register HF6 tests in test and test:320)
- RC1_7_1_HF6_RELEASE_NOTES.md (new)

## Test results in preparation environment
- 23/23 focused tests pass (RC4.4 + HF5 + HF6, Node v22 experimental TypeScript stripping).
- 280 TS/TSX/MTS files pass parser validation (zero parse errors).
- Standalone strict typecheck of teamTeachingTask.ts succeeds.
- Full npm ci / application lint / complete test suite / Vite build / browser E2E / live Supabase integration NOT verified here because the project's installed dependencies are unavailable. Do not promote to production until passing local + staging validation.

## Install (Windows Snapdragon ARM64)
- On HF5: extract HF6 PATCH into the root of the existing project. PATCH does not contain .env.local.
- Otherwise: use PERSONAL HF6. PERSONAL preserves .env.local bytes from supplied PERSONAL HF5. Keep PERSONAL private and never push credentials.
- SHAREABLE HF6 contains no .env.local.
- No database migration is necessary.

Run at the project root:

```bat
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

## Staging UAT — important
1. With LALU, HAIKAL, ARIA and ALI on the same active class/date/JP, have LALU leave with YADIQ assigned as badal and an instructional task recorded.
2. In Dashboard Kelas, confirm original task is present. Open Dashboard Guru, choose HAIKAL, then ARIA and ALI, selecting the SAME DATE. Under the teacher selector, check the **Tugas untuk Teaching Team** panel. Each must open the same task and URLs.
3. Choose YADIQ: original badal card continues to show the task; peer panel must not duplicate it. Choose LALU: no peer task panel for their own leave.
4. Test a date with coverage status COMPLETED; check a second class/JP; ensure task only appears for legitimate active teammates.
5. Test a teacher on leave, class cancellation, or conflicting official duty: task must not be offered as an active team obligation.
6. Modify the task through admin and refresh the Dashboard Guru; all readers must get the updated task text.
7. Verify legacy NO_SUBSTITUTE teaching-team instructions remain visible.

## Rollback
Restore HF5 source or reverse the HF6 patch; no database rollback needed.
