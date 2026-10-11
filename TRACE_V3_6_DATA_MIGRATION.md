# TRACE V3.6 — Spreadsheet → Supabase Data Migration

## Goal
V3.6 builds a repeatable, staging-only migration pipeline from the duplicated Google Sheets database into Supabase PostgreSQL. It does **not** switch normal E-Jadwal screens to Supabase yet.

## Safety boundary
- Migration runs only from `?supabase-migrate=1`.
- Browser uses the publishable Supabase key + authenticated ADMIN session; no service-role/secret key is used.
- Preflight must have **0 BLOCKING issues** before import is enabled.
- Legacy `akun/password` is never migrated.
- Google Drive remains file storage. Existing task URLs are preserved as task metadata/resources.
- Normal E-Jadwal runtime still uses the legacy Apps Script data path until consumer cutover.

## V3.6 Apps Script source upgrade
`Code.gs` now:
1. adds `_row_id` alongside legacy/business `id` so migration has a separate row identity;
2. exposes optional Master Guru fields `panggilan`, `gender`, and `whatsapp_e164`;
3. fixes the legacy `ruang -> kelas` alias landmine so `ruang` maps to `ruangan`;
4. supports `?migration=1`, which omits the legacy `akun` payload from the migration request.

The migration preflight deliberately blocks an old source backend that does not expose `_row_id`.

## Supabase migration support
Apply:
- `202610050006_v3_6_legacy_import_support.sql`
- then run `202610050007_v3_6_verify_legacy_import_support.sql`

V3.6 adds stable legacy import keys/indexes for:
- `teachers.legacy_row_id`
- `schedule_master.legacy_row_id`
- `schedule_incidentals.legacy_row_id`
- `academic_events.legacy_row_id`
- `coverage_slots.legacy_log_id`

## Import mapping
- `Master Guru` → `teachers`
- class strings referenced by source sheets → `classes`
- `Master Ruangan` → `rooms`
- `Jadwal` → `schedule_master` + `schedule_master_teachers`
- `Jadwal_Insidental` → `schedule_incidentals` + `schedule_incidental_teacher_overrides`
- `Kalender_Akademik` → `academic_events`
- `Log_Izin` → `coverage_slots` with `source=LEGACY_IMPORT`
- legacy `tugas` → `learning_tasks`; URLs are additionally extracted into `task_resources`
- Google Drive links are recognized as `DRIVE_FILE` metadata when a Drive file ID can be parsed
- `akun` → ignored

## Important preservation rules
- JP `0` is valid and preserved.
- Blank incidental teacher slots mean **inherit**, so no `CLEAR` override is generated.
- Blank incidental subject/room remain null overrides and therefore inherit master data.
- Unknown teacher references do not invent a master teacher; the name snapshot is preserved and `teacher_id` stays null. This is a warning, not a blocker.
- Unknown nonblank room values are blocking because silently losing room data is not acceptable.
- Academic calendar blank scope + filled class uses the existing safe legacy fallback `CLASS` and emits a warning.
- Academic calendar blank scope + blank class is blocking; V3.6 will not silently treat it as global.
- Legacy assignment timestamps are unknown, so V3.6 does not invent `assigned_at` values.

## Idempotence / re-run behavior
The importer upserts stable master data and legacy keyed rows, removes stale legacy-keyed schedule/event/coverage rows, rebuilds child teacher/task rows, and deactivates legacy Master Guru rows that disappeared from the current source snapshot instead of deleting teacher identities.

Do not reorder the Spreadsheet between **Fetch + Analyze** and **Run Migration**. `_row_id` represents the source row identity for that fetched snapshot.

## Preflight examples
BLOCKING:
- old Apps Script without `_row_id`;
- duplicate Master Guru names;
- invalid date/JP;
- unknown nonblank room;
- ambiguous academic calendar scope;
- duplicate Log_Izin identity.

WARNING:
- invalid WhatsApp value (stored as null);
- teacher reference absent from Master Guru (snapshot preserved);
- blank calendar scope + class legacy fallback.

## Staging UI
Run local dev server and open:
`http://localhost:3000/?supabase-migrate=1`

Flow:
1. login as Supabase ADMIN;
2. paste/confirm Apps Script Web App URL;
3. click **Fetch + Analyze**;
4. review blockers/warnings;
5. import only when blockers = 0;
6. type `MIGRATE`;
7. click **Run Migration**;
8. click **Verify Counts** and require `VERIFY PASS`.

## Runtime status
Normal dashboards still use Apps Script in V3.6. Consumer cutover is deferred until migration counts and parity are verified.
