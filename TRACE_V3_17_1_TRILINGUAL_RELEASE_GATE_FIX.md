# E-JADWAL V3.17.1 RC1 — Trilingual Release Gate Hotfix

## Base
V3.17 RC1 (`e-jadwal-v3.17-trilingual-rc1-full.zip`). No SQL or dependency changes.

## Fixes
1. `EducationCalendar.tsx`: the selected-day heading passes the active `locale` into `pretty(selectedDate, locale)`; this fixes `TS2554` on Windows lint and makes the day heading language-aware.
2. `v3-16-3-reminder-navigation-ux.test.ts`: navigation separator and footer-link/collapse assertions now validate the localized controls and their ordering instead of requiring hard-coded Indonesian UI text.
3. `v3-16-1-education-admin-ux.test.ts`: event-list assertion checks `t("Daftar Kegiatan")` and the same visible count.
4. `v3-17-trilingual.test.ts`: a regression test guards the selected-day locale argument.

No runtime modifications beyond the calendar date-heading argument. No change to Supabase, schedules, coverage, permissions, or persistence.

## Windows install
1. Back up your V3.17 RC1 folder.
2. Extract the `e-jadwal-v3.17.1-patch-from-v3.17.zip` into the **project root** and allow overwriting. The ZIP contains root-relative paths, not a nested project folder.
3. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` and then `npm.cmd run dev`. If modules are missing, run `npm.cmd ci` first.

## Verification note
Focused 16 tests pass using an offline Node/TypeScript loader. Full npm test, lint, and Vite build could not be run in the packaging environment because npm dependencies were not installed and npm registry DNS was unavailable. The user’s Windows npm runs are the release gate.
