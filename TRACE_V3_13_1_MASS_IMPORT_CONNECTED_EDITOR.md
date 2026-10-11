# TRACE — V3.13.1 Mass Schedule Importer + Connected Quick Editor + JP-0 Homeroom

## Goal
V3.13.1 turns the school's existing spreadsheet-first timetable workflow into a safe canonical Supabase workflow without forcing staff to re-enter thousands of cells manually.

Two complementary paths are introduced:

1. **Mass Schedule Importer** — large semester/year timetable changes from the established Excel `ori` template.
2. **Connected Quick Editor** — small surgical corrections directly from the teacher Dashboard using a pencil button.

Both paths write to the same `schedule_master` + `schedule_master_teachers` canonical source. Every downstream consumer therefore refreshes from one schedule truth.

## Real `ori` workbook projection
The parser was designed against the uploaded production-like workbook tab `ori`, not a synthetic layout.

Observed structure:
- 62 class columns (C:BL)
- Monday–Thursday: 6 JP blocks each
- Friday: actual JP/time rows are read from the sheet; class 12 currently contains active JP4/JP5 cells
- Saturday marker exists but has no active assignments
- Formula references such as `=E14` / `=M3` are supported
- formatting/colors are **not** used as parsing rules

Offline parser projection against the real `ori` tab:
- 1,682 non-empty assignment cells ditemukan; 1,681 dapat diparse dan 1 cell malformed diblok
- Monday: 372
- Tuesday: 372
- Wednesday: 372
- Thursday: 372
- Friday: 194
- parser structural errors: 0

The importer deliberately follows `day marker -> class header -> JP/time rows` instead of hard-coding "Friday has N periods".


## JP-0 Homeroom projection

JP-0 is now a first-class attendance and substitute-coverage period.

Client semantics:
- the Leave Request period queue begins at `JP-0`
- a teacher with `wali_kelas` / `pendamping_kelas` gets `JP-0 = TEACHING`
- a teacher without homeroom duty gets `JP-0 = FREE` for attendance/statistics only
- Homeroom coverage is serialized into `leave_request_slots` with subject `Homeroom Session (...)`
- JP-0 requires a substitute but intentionally has no lesson-material task UI

Server semantics:
- `leave_request_periods.period` now accepts `0..6`
- public V2 period validation accepts up to seven periods
- `ejadwal_school_period_active(date, 0)` treats JP-0 as active whenever the school day has active KBM and is not fully suppressed by Kalender Akademik
- `ejadwal_teacher_scheduled_for_leave_slot(..., 0)` recognizes the existing homeroom master convention from `teachers.additional_task + teachers.notes`, while still supporting explicit canonical JP-0 schedule rows if added later
- approval materializes JP-0 into `coverage_slots`, so the existing Inval/Badal engine can assign a substitute
- mass `REPLACE_ACTIVE` preserves period `0`, because the current `ori` template is an academic timetable and does not encode Homeroom

This avoids the dangerous partial implementation where JP-0 appears in the form but fails approval/server validation.


## Import pipeline

```text
XLSX / Paste TSV
      ↓
Template parser (`ori`)
      ↓
Class resolution
      ↓
Teacher alias resolution
      ↓
Subject normalization against current schedule
      ↓
Combined-session inference
      ↓
Conflict validation
      ↓
Draft Preview
      ↓
ADMIN Publish
      ↓
Canonical Supabase schedule
```

### Teacher Alias Resolver
Resolution candidates are exact-normalized only:
- teacher `full_name`
- teacher `short_name`
- teacher `legacy_name`
- reusable `schedule_teacher_aliases`
- explicit manual mapping from the importer UI

No dangerous fuzzy guessing is performed. A manual resolution can be saved as an alias for the next semester.

### Class normalization
The resolver tolerates leading-zero grade differences (`03 INTER ...` vs `3 INTER ...`) while keeping the canonical class UUID.

### Combined inference
Rows are inferred as one shared teaching session only when they have identical:
- day
- JP
- time
- subject
- full teacher set

Teacher conflict detection runs **after** this inference, preventing legitimate combined classes from being reported as double-booking.

## Publish modes
### REPLACE_ACTIVE (default)
- old active master rows are soft-deactivated
- new canonical rows are inserted
- old history remains queryable
- room IDs for matching class/day/JP are carried forward when `ori` has no room field

### MERGE
Only incoming class/day/JP slots are replaced; untouched active slots remain.

## Connected Quick Editor
In Admin mode, normal recurring Dashboard schedule cards expose an `Edit` pencil.

Editable fields:
- class (single-row session)
- subject
- day
- JP
- start/end time
- room
- teacher set (max 6)
- combined flag
- special note

For inferred/explicit combined sessions, the Dashboard opens all canonical rows in one editor and saves them atomically with the same teacher/subject/time configuration while preserving each class identity.

### Pre-save safety
The UI checks:
- class slot collision
- teacher slot collision
- room slot collision

The Supabase RPC repeats hard validation server-side, so UI bypass cannot silently create obvious conflicts.

## Connected consumers
After import or quick edit, App reloads one Supabase snapshot. Therefore changes flow automatically to:
- Dashboard Guru
- Jadwal Lengkap
- Jadwal Kelas
- Jadwal Ruangan
- free/busy availability
- Leave Request teaching-period detection
- Inval/badal recommendation engine
- reporting consumers built from the canonical snapshot

## Database changes
Migration `030` adds:
- `schedule_teacher_aliases`
- `schedule_import_batches`
- `ejadwal_upsert_schedule_teacher_alias(...)`
- `ejadwal_publish_schedule_import_v1(...)`
- `ejadwal_update_schedule_master_v1(...)`

Verifier `031` returns one 15-row result set, including JP-0 leave/coverage guards.

## Security
- Import and Quick Edit mutation RPCs require `ADMIN`
- WAKASEK operational permissions are unchanged
- mutation functions are security-definer with explicit role checks
- every publish / quick edit creates `audit_logs` evidence

## Dependency
V3.13.1 adds browser-side `xlsx` parsing (`xlsx@^0.18.5`). Run `npm.cmd install` after upgrading.

## Compatibility cleanup
`src/infrastructure/supabase/client.ts` no longer assumes `import.meta.env` exists. This fixes the Node test-environment crash seen in V3.13.0 while preserving normal Vite behavior.

## Validation completed in build environment
- real `ori` structural parser: 1,681 parsed rows + 1 `MALFORMED_ASSIGNMENT` (AZ3), sesuai typo nyata pada workbook
- formula reference parsing: PASS
- focused schedule-import assertions: 6/6 PASS
- focused JP-0 leave/domain assertions: 5/5 PASS
- TypeScript application-specific static errors after filtering missing local dependencies: 0
- SQL parenthesis balance: PASS
- SQL dollar-quote pairing: PASS
- migration transaction wrapper: PASS

Full `npm test`, `npm run lint`, and `npm run build` remain the release gate on the user's machine because package registry installation is unavailable in the build environment.
