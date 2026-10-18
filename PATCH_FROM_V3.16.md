# PATCH V3.16 RC1 → V3.16.1 RC1

Install ONLY on a V3.16 RC1 source root (next to package.json). Unzip with **overwrite** while retaining paths. No database migration and no changes to Supabase tables, RLS, education events, or the schedule engine.

Changes:
- In **Input Kalender Pendidikan**, Edit scrolls the nested content area to the editor form (`scrollIntoView`, not `window.scrollTo`).
- Default list excludes events whose **end date** is before **today in Asia/Jakarta**, and includes all ongoing or upcoming events regardless of publish status.
- **Tampilkan kegiatan lampau** is OFF by default, toggles full event list visibility, and displays archive count. Past records remain editable; no deletion.
- Package version increments to 3.16.1-rc.1 and `npm test` includes the new UX regression file.

Release gate (Windows): `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev`. Confirm edit scroll from the bottom of a long event list and date boundary with past, current, and multiday events. Tests in this environment are focused/source-only; full npm build and actual browser interactions require local verification.

Full notes: `TRACE_V3_16_1_EDUCATION_CALENDAR_ADMIN_UX.md`.
