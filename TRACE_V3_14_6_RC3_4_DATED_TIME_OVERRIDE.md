# TRACE V3.14.6 RC3.4 — Dated Time Override

Baseline: **V3.14.6 RC3.3**. Status: **release candidate — validate on Supabase staging**.

## Why

Special activities can shift the actual clock without changing the identity of a teaching period. Example: Gladi Resik TKA ends at 09:00, students rest until 09:20, and **JP2** for a class runs **09:20–10:20** on **2026-10-12**, while the normal JP2 remains **09:00–10:00** on future Mondays.

## Changes

- Jadwal Insidental: optional checkbox **Ubah pukul khusus tanggal ini**, inputs **Mulai (pukul)** and **Selesai (pukul)**. Existing incidental times are loaded when revising.
- Dashboard Quick Edit: mode **Hanya Tanggal Ini** can toggle **Atur jam khusus tanggal ini**. Master edit remains unchanged; switching back to permanent resets the clock fields to canonical master times.
- Incidental records now support nullable `override_start_time` and `override_end_time`. Both NULL mean *inherit master time* (or the JP clock for a standalone additional session). Both must be specified together, on the same date, with start before end.
- Dated effective projection, Dashboard teacher/wali kelas, Jadwal Kelas (Minggu Ini + PNG), and Jadwal Ruangan read the dated time. Jadwal Kelas (Asli) keeps the master clock.
- A dated edit does **not** shift any other JP automatically or change master recurrence. It does not change class + date + period slot ownership, room edit behavior, teacher team assignment, or calendar events.
- Quick Edit dated room conflicts remain warnings as in RC3, while master edits still block conflicts.
- Existing Syaikh rotation and room edit RPC v1/v2 are not replaced: only the two form save paths use RPC v3.

## Database migration REQUIRED

1. Apply previous RC1/RC2/RC3 migrations first if not yet applied:
   - `202610110001_v3_14_6_weekly_room_editor.sql`
   - `202610110002_v3_14_6_incidental_combined_sessions.sql`
   - `202610110003_v3_14_6_incidental_conflicts_nonblocking.sql`
2. Apply **`supabase/migrations/202610110004_v3_14_6_dated_time_overrides.sql`** to **staging** (Supabase SQL Editor). This creates the time columns, pair constraint and the two secured v3 RPC wrappers.
3. Run local release checks: `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev`.
4. Only after the smoke tests pass, follow the normal migration-then-Vercel release procedure.

## Smoke tests

1. Pick **12 MQ AKHWAT** on **Mon 12 Oct 2026**, **JP2**, whose normal time is e.g. **09:00–10:00**. From Dashboard Quick Edit → **Hanya Tanggal Ini**, check the time override, enter **09:20–10:20**, and save. Confirm in Dashboard, Jadwal Kelas **Minggu Ini**, Jadwal Ruangan and Supabase `schedule_incidentals`.
2. Check **Jadwal Asli** and the following Monday (19 Oct); both must still show the normal master time.
3. Reopen the dated Quick Edit or Incidental Edit; the checkbox must be checked with the saved times. Uncheck and save; the date should inherit its normal clock again.
4. Ensure changing **only the room** via Jadwal Ruangan does not discard an existing dated time; room-only incidentals with no explicit time continue inheriting the master clock.
5. For a standalone additional insidental on a free JP, set a custom time and verify it displays properly.
6. Test errors: no end time, end earlier than start; both must be rejected before saving. JP and date remain unchanged.
7. Test an existing Syaikh rotation import to ensure v1/v2 compatibility.

## Verification in authoring environment

- 159 TS/TSX files parsed without syntax errors.
- Domain-specific `tsc --strict` subset compiled, and runtime effective-schedule checks passed.
- Full suite under an alternative Node TypeScript loader: **283 tests passed**, two modules unavailable due to missing React/Supabase packages. Not equivalent to running the official `npm.cmd test` with installed dependencies.
- SQL not executed against a live Postgres instance; full `npm ci`, `npm run lint`, Vite build and browser staging tests remain release gates.

**Do not directly push to production Vercel until migration and staging validation pass.**
