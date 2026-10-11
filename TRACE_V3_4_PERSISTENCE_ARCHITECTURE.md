# TRACE V3.4 — Persistence & Data Architecture

## Status

V3.4 is an architecture checkpoint. It deliberately does **not** switch the running React application away from Apps Script yet.

The V3.3 canonical schedule engine remains unchanged and remains the behavioral authority for:

`Master → Incidental → Izin/Badal → Academic Calendar → Effective Schedule`.

## Decision

E-Jadwal V3 will use a hybrid persistence architecture:

- **Supabase PostgreSQL** — structured operational data.
- **Supabase Auth** — identity and application roles.
- **Google Drive** — actual files/attachments. No Supabase Storage dependency is required.
- **Apps Script / Google API bridge** — upload and Google Drive integration only.
- **Vercel** — React frontend.

Google Sheets remains the migration source and emergency/reporting surface during the transition, but it is no longer the intended long-term transactional database.

## Why the split matters

The new roadmap needs relational integrity and queryable operational history: leave approval, badal waiting lists, task state, audit logs, room/class relations, teacher workload, and future evaluation analytics. Those belong in PostgreSQL.

Binary files do not. The school already has Google Drive capacity, so the database stores only file metadata (`drive_file_id`, URL, name, MIME type) while the bytes stay in Drive.

## Pragmatic normalization

V3.4 intentionally does not normalize every string into its own master table. In particular, `subject` remains text for the first migration. Existing data uses free-text mapel names, and aggressively normalizing them now would add migration risk without solving the current architectural problem.

The tables that most need stable identity are normalized now: teachers, classes, rooms, schedules, users, leave requests, and coverage slots.

## Legacy → PostgreSQL map

### `Master Guru` → `teachers`

Current fields:

- nama
- mapel_utama
- rumpun
- jenjang
- tugas_tambahan
- keterangan

Migration:

- `nama` → `full_name` and `legacy_name`
- `mapel_utama` → `primary_subjects_text`
- `rumpun` → `subject_cluster`
- `jenjang` → `levels_text`
- `tugas_tambahan` → `additional_task`
- `keterangan` → `notes`

New fields not inferred from teacher names:

- `gender`
- `whatsapp_e164`
- `short_name`

These should be filled explicitly.

### `Jadwal` → `schedule_master` + `schedule_master_teachers`

One legacy row becomes one `schedule_master` row.

`guru1..guru6` become ordered child rows with `position=1..6`. This removes the hard-coded six-column persistence model while the repository can still project them back to the current V3 domain shape during migration.

`kelas` resolves to `classes.id`.

`ruangan` resolves to `rooms.id`.

### `Jadwal_Insidental` → `schedule_incidentals` + teacher overrides

Identity remains:

`date + class + period`

Mapel is **not** part of identity.

Nullable override fields mean **inherit master**. This directly preserves the V3.3 field-level inheritance rule.

Teacher overrides are stored only when a position actually changes. No override row means inherit. The new schema also supports explicit `CLEAR` in the future without changing the current legacy meaning of blank cells.

### `Log_Izin` → `coverage_slots`

Legacy `Log_Izin` is operational substitution data, not an approval request. It maps to `coverage_slots` with:

- `source = LEGACY_IMPORT`
- `status = ASSIGNED` when a substitute exists
- `status = WAITING` when no substitute exists

The new `leave_requests` table is separate and becomes the source for the future teacher-submit → Wakasek-approve workflow.

This means existing history can be migrated without fabricating approval records that never existed.

### `Master Ruangan` → `rooms`

Existing canonical IDs such as `LABKOM`, `LABIPA`, and `RSG` remain the primary room IDs. Aliases become a PostgreSQL text array.

### `Kalender_Akademik` → `academic_events`

A database UUID is the real row identity.

The old `id` becomes `legacy_event_code` and is deliberately **not unique**, because the current sheet can repeat the same event code for several classes.

JP `0` remains valid. Full-day events keep both period boundaries null.

### `akun` → **DO NOT migrate passwords**

The legacy `akun` sheet is retired when Supabase Auth is activated.

Do not copy plaintext legacy passwords into PostgreSQL or Supabase Auth. Users should be created/invited/reset through the new authentication flow.

Existing account names can be used only as a migration checklist for assigning roles.

## New workflow tables

### `leave_requests`

Represents the teacher's request and Wakasek decision only:

`SUBMITTED → APPROVED / DECLINED / CANCELLED`

Approval does not require a task to exist yet.

### `coverage_slots`

One row = one absent teacher for one concrete date/class/JP.

When a leave request is approved, the application generates the impacted slots here. These rows are the **Badal Waiting List**.

Possible states:

- WAITING
- ASSIGNED
- NO_SUBSTITUTE
- CANCELLED
- COMPLETED

This table also absorbs historical `Log_Izin` records.

### `learning_tasks` / `task_resources`

`learning_tasks.description` stores task instructions.

A resource can be:

- LINK
- DRIVE_FILE

For Drive files, PostgreSQL stores metadata only. File bytes remain in Google Drive.

## Google Drive boundary

The Drive bridge should eventually expose narrow operations such as:

- upload task file
- return `drive_file_id`, URL, file name, MIME type
- optionally delete/archive a file when authorized

Apps Script should **not** remain the main schedule database API after migration.

Never place Google Drive credentials or privileged upload secrets in the React bundle.

## Authentication / authorization boundary

V3.4 creates the structural tables:

- `user_profiles`
- `user_roles`

Roles planned initially:

- TEACHER
- WAKASEK
- ADMIN

RLS is enabled on all Supabase-facing tables, but V3.4 intentionally creates no end-user policies. Therefore the schema is safe-by-default until V3.5 explicitly defines permissions alongside the new repository/auth layer.

## Important compatibility decision

The canonical engine remains database-agnostic.

V3.5 will build repository adapters that translate PostgreSQL rows into the existing domain inputs:

- `ScheduleItem[]`
- `JadwalInsidentalItem[]`
- `LogIzinItem[]`
- `KalenderAkademikItem[]`

Therefore the tested V3.3 engine does not need to know whether data came from Google Sheets or PostgreSQL.

## Migration strategy

1. Keep V2 production untouched.
2. Keep the duplicated Google Sheet as staging migration source.
3. Create an empty Supabase **staging** project.
4. Apply the V3.4 schema migration.
5. V3.5: implement auth/RLS + repository interfaces.
6. Import master data first: teachers, classes, rooms.
7. Import schedule master and incidentals.
8. Import academic events.
9. Import `Log_Izin` into coverage slots and task text/resources.
10. Run parity checks against the canonical engine.
11. Only after parity: migrate consumers away from Apps Script.

## Intentionally NOT done in V3.4

- No Supabase SDK dependency added.
- No application fetch path changed.
- No production/staging data imported.
- No old account password migrated.
- No Apps Script endpoint removed.
- No RLS end-user policies guessed prematurely.
- No Supabase Storage used.
- No consumer migrated to PostgreSQL yet.

## V3.5 target

**Supabase Staging + Repository Layer + Auth/RLS foundation**.

That is the first version where the React app will be capable of reading the same domain data through a PostgreSQL-backed repository while preserving the V3.3 canonical engine.

## Source audit findings recorded during TRACE

The legacy adapter currently has two important migration concerns:

1. `Code.gs` maps the alias `ruang` to `kelas` in both `Jadwal` and `Jadwal_Insidental`, while `ruangan` correctly maps to the room field. The PostgreSQL migration must not carry this ambiguity forward.
2. The current GET payload includes the legacy `akun` dataset, including password values. V3.4 explicitly ends that design at the persistence boundary; credentials move to Supabase Auth and plaintext legacy passwords are not migrated.

See `docs/LEGACY_DATA_INVENTORY.md` for the complete inventory.
