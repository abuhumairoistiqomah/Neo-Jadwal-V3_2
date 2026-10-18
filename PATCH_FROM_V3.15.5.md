# PATCH — V3.15.5 → V3.16 RC1

Patch ONLY for the full source V3.15.5. Extract this ZIP in **project root** (the directory containing `package.json`), overwrite changed files, and keep paths as-is.

**FIRST BACK UP YOUR DATABASE AND CODE; test in Supabase staging.** Then execute `supabase/migrations/202610170002_v3_16_education_calendar.sql` in Supabase SQL Editor (staging first). Use `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, then `npm.cmd run dev` on Windows.

No existing schedule/leave/badal tables are modified by the SQL. Confidential events are protected by Supabase RLS (not just hidden in React).

See `TRACE_V3_16_EDUCATION_CALENDAR.md` for verification, limitations and role matrix.
