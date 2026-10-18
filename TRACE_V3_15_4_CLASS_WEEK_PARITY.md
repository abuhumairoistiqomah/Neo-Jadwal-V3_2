# TRACE V3.15.4 — Class/Teacher Week Parity (RC1)

Baseline: V3.15.3. No schema, RPC, authorization, or data migration changes.

## Change
- **Jadwal Kelas** now defaults to **Jadwal Insidental** (effective dated schedule), like Jadwal Lengkap Guru.
- Two modes use the same labels: **Jadwal Normal** (master) and **Jadwal Insidental** (effective).
- Share the **existing** `teacherWeekDays` helper, which uses the school date in **Asia/Jakarta** and room-week weekend logic: Mon–Fri current week, Sat/Sun following week.
- Navigate previous/next school week; reset with "Minggu default". Mode switches do not reset the selected week.
- Class effective schedule, dated cell labels, quick-edit date, calendar overrides, badal, and PNG use the chosen week. PNG name includes the Monday date for effective mode.
- Teacher schedules, class master rows, SQL and write-side logic unchanged.

## Validation gates
`npm.cmd test` → `npm.cmd run lint` → `npm.cmd run build` → `npm.cmd run dev`.

Smoke: on **Saturday 17 Oct 2026** class effective view should select **19–23 Oct 2026**; previous week is **12–16 Oct 2026**. Verify badal + school calendar, return to normal and back, download PNG for each week; file names must differ.

Status: candidate pending full Windows checks and browser integration smoke test.
