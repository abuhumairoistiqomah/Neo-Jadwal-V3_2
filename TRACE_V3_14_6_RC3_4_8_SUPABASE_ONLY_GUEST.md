# TRACE V3.14.6 RC3.4.8 — Supabase-only guest runtime

## Root cause

RC3.4.7 still bootstrapped Google Apps Script in public/guest mode and the public header offered **Refresh Data from Google Sheets**, overwriting Supabase snapshots in React state and localStorage. Admin mode alone loaded the canonical Supabase schedule. The source-of-truth split was confirmed in `src/App.tsx`.

## Changes

- All timetable modes (Admin and guest) load **live Supabase**. Switching Admin is strictly an authorization/UI distinction, never a database selection.
- Guest reads `ejadwal_public_schedule_snapshot_v1()` via `SupabasePublicScheduleRepository`. The same canonical mapper is used by staff read and guest read.
- The SQL RPC is a **sanitized, read-only `SECURITY DEFINER` projection**, with `anon`/`authenticated` EXECUTE only. No table grants or RLS bypass for client-side raw SELECT. It does not return phone numbers, raw teacher notes, leave reasons, private staff restriction reasons, task text, or task resource URLs. A sanitized normal-teaching-block flag is exposed so public Dashboard colors follow actual teacher duties.
- Remove the Apps Script schedule-sync UI, automatic GAS bootstrap, legacy fixture fallback, and localStorage schedule cache. The Google Apps Script URL is retained ONLY for optional Google Drive task-upload bridge use, not timetable reads.
- Header uses **Refresh Supabase** for both modes. On failed read, clear old timetable state and show error; do not silently show stale data.
- Avoid a race where an older guest response overwrites a later admin response with a monotonic request counter. On logout clear privileged in-memory data and load guest projection.
- Gate page content during loading/error to prevent presenting blank datasets as an actual free schedule.

## Required migration

`supabase/migrations/202610120003_v3_14_6_guest_supabase_read.sql`

Apply in **staging**, after RC3.4.7 migration `202610120002`, using Supabase SQL Editor/migration runner; the function owner requires access to source tables. Do not publish frontend RC3.4.8 before the RPC exists. No GAS redeploy.

## Release gates (staging)

1. `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
2. With Admin OFF and fresh/incognito browser, confirm **Refresh Supabase**, same current dated incidental, calendar override and substitution as Admin (subject to intentionally hidden private fields).
3. With Admin ON compare teacher + class + room effective schedules at same dates/JP. Switch off and back; confirm no Google Sheets refresh and correct public data.
4. Temporarily revoke EXECUTE on RPC or test a broken staging URL: the app must report Supabase load failure and **never** display Google Sheets/mock data.
5. Verify `anon` has no direct `SELECT` on `coverage_slots`, `teachers`, `leave_requests`, `learning_tasks`, `task_resources` and inspect RPC JSON for absence of confidential fields.
6. Check teacher homeroom JP0 and special incidental cases. Public projection turns teacher notes into known class-name mentions only; unusual legacy homeroom formats may need additional mapping in future.
7. After success, apply migration to production before pushing frontend to Vercel. Confirm Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Verification status

5 purpose-built static regression assertions PASS. TypeScript parser PASS for all sources. Full npm lint/build and execution of SQL against real staging Postgres **not verified here** (npm dependencies unavailable in container).

## Rollback

Revert Vercel frontend to previous production build if any regression. RPC is additive; dropping it is optional AFTER older frontend restored. Do not use RC3.4.7 non-admin as canonical during rollback (it still reads Google Sheets).
