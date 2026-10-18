# E-JADWAL V3.17.3 RC2 — Mobile Teacher Timetable Detail Parity

## Baseline / Scope

Built on `V3.17.3 RC1`, retaining all of RC1's availability guard, cross-dashboard transfer and incidental duty resolution. This is a responsive presentation fix in **Jadwal Pribadi > Jadwal Lengkap Guru**. It changes no Supabase schema, RLS, schedule rows, approved leave or teacher assignments.

## Root cause

`src/components/JadwalLengkap.tsx` contains independent desktop (`hidden md:block`) and mobile (`block md:hidden`) views. Desktop rendered `TeacherWeekRow.weekStatus` and `.weekDetail`; the mobile card omitted both. Consequently, an incidental Al-Qur'an supervision slot showed its subject, class and team teacher, but not the supervision reason or its `INSIDENTAL` status.

## RC2 Changes

- New `src/domain/schedule/teacherWeeklyPresentation.ts`: shared presentation helper that returns status labels, dated operational details and special notes, trimmed and de-duplicated per JP. MASTER mode never inherits dated EFFECTIVE reasons.
- Desktop grid and mobile cards use that *same* helper, reducing the chance of responsive display drift.
- Mobile cards display supervision details / incidental reasons, BADAL, IZIN, official duty, calendar cancellation and any `keterangan_khusus`. No tooltip or expansion required for core details.
- Mobile incidentals use the same visual status precedence as desktop. A non-normal status no longer pairs with the misleading "Reguler (1 JP)" label; it shows operational status + "1 JP".
- Long reasons and class names wrap within the card.
- Detail popup also displays operational status and reason (additional to existing special-note display).
- Package version bumped to `3.17.3-rc.2`. Five new tests integrated into `npm test` and `npm run test:watch`.

## What was verified in this build environment

- New focused test suite: 5/5 PASS (using transpilation via locally installed TypeScript and Node test runner). Scenarios include incidentals with supervision notes, official duty, badal, leave, calendar, MASTER vs EFFECTIVE, duplicate notes and source-level desktop/mobile parity.
- Syntax transpilation: 223 TS/TSX files, 0 errors (excluding `.d.ts` declaration files).
- Archive integrity checked after packaging.
- Full `npm run build`, `npm run lint`, full `npm test`, and browser/mobile visual smoke test **not verified here** because node_modules dependencies are not present. Run these in staging before production deployment.

## Installation

1. Backup current RC1 source and deployment.
2. Apply the RC2 patch at project root (or use the full-source archive). RC2 patch is strictly from **V3.17.3 RC1**. It is not a patch from RC2 to a different branch.
3. **No SQL migration** is needed for RC2. Retain V3.17.3 RC1 database migration and approved-leave guard as already installed.
4. On Windows in the project root: `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, then `npm.cmd run dev`.
5. In mobile browser at <768px, open the selected teacher's weekly timetable and compare to desktop for the same teacher, schedule mode, and week. Specifically check ISTIQOMAH AS SAYFULLOH, M.Pd — Tuesday JP1 incidental Al-Qur'an supervision, with the expected text "Ustadzah Asysyifa supervisi dengan Mr. Is" if that is what the dated data contains.
6. Check normal Math slots remain readable; team teaching, class, JP and time visible; incidentals, leave/badal, official duty and calendar reasons show when present; switch to MASTER and verify no dated incidental text leaks.
7. Check no horizontal clipping at 320px and 375px, and open the detail popup.

## Release status

`RC2 — staging candidate`. No claim of production stability until full tests and real mobile/browser verification pass.
