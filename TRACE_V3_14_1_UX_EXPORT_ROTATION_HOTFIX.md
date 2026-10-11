# TRACE V3.14.1 — UX, Export & Rotation Hotfix

## Scope

V3.14.1 closes five production-facing issues found after V3.14:

1. Action Center no longer breaks when an older/staging database is missing `ejadwal_expire_stale_waiting_coverage(date)`. The browser keeps the active queue correct with `schedule_date >= schoolToday`, while migration 046 restores the RPC for actual database cleanup.
2. Supabase/PostgREST error objects are rendered through `getErrorMessage()` instead of becoming `[object Object]`.
3. Sidebar order prioritizes teacher-accessible pages, with an **Administrasi** separator before staff/admin workflows.
4. Jadwal Kelas JPG export uses an isolated class-free clone with computed styles converted to safe RGB/RGBA values. It no longer mutates the live document stylesheets/adoptedStyleSheets during capture.
5. Shared `ScheduleQuickEditor` gains **Pelajaran Bergantian / Rotasi**, with 2/3/4-week patterns and canonical `ALTERNATING` class mode for both permanent and incidental edits.

## Database

Run:

```text
202610100046_v3_14_1_ux_export_rotation_hotfix.sql
202610100047_v3_14_1_verify_ux_export_rotation_hotfix.sql
```

Verifier target: **10 / 10 TRUE**.

The migration preserves older RPCs (`master v2`, incidental v1) and adds:

- `ejadwal_update_schedule_master_v3(...)`
- `ejadwal_upsert_schedule_incidental_v2(...)`
- `ejadwal_upsert_schedule_incidental_session_v2(...)`

This avoids breaking older clients while allowing Quick Edit to persist `NORMAL`, `COMBINED`, or `ALTERNATING` explicitly.

## Alternating semantics

`ALTERNATING` is deliberately mutually exclusive with `COMBINED` in the Quick Editor. This matters because inferred combined-session grouping must not merge two alternating lessons merely because teacher/subject/time happen to match.

The selected recurrence (2/3/4 weeks) is preserved in `special_note`, defaulting to `1 kali / N minggu` when no custom note is supplied.

## JPG export

The export pipeline:

```text
live timetable DOM
  -> deep clone
  -> copy computed styles inline
  -> remove Tailwind classes
  -> convert OKLCH/OKLAB to RGB(A)
  -> neutralize unsupported color/filter/image functions
  -> html2canvas isolated clone
  -> JPEG Blob
  -> browser download
```

Quick-edit pencil controls carry `data-export-ignore="true"`, so the downloaded timetable is clean even when Admin Mode is enabled.

## Smoke tests

1. Open Action Center against a database that has not yet run migration 046: page should still load; stale rows are hidden by the query filter. After migration 046, stale WAITING rows should also become EXPIRED in DB.
2. Force an analytics RPC error: the red panel should show actual `message/details/hint/code`, never `[object Object]`.
3. Check sidebar: teacher pages appear first; admin workflows start below **Administrasi**.
4. Open Jadwal Kelas -> choose a class -> **Unduh Jadwal Kelas (JPG)**. Verify the resulting image contains the full timetable and no Quick Edit pencils.
5. Quick Edit -> check **Pelajaran Bergantian / Rotasi** -> choose `1 kali / 2 minggu` -> save permanent, refresh, and confirm violet/alternating semantics remain. Repeat using **Hanya Tanggal Ini**.

## Apps Script

No `Code.gs` change. No GAS redeploy or OAuth refresh is required.
