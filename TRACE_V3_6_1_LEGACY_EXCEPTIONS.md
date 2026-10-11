# TRACE V3.6.1 — Legacy Exception Preservation

## Why this checkpoint exists

V3.6 preflight surfaced valid legacy practices that should not be "cleaned away":

1. Some `Jadwal_Insidental` rows intentionally leave `kelas` blank because they only declare that a room is unavailable for a date/JP.
2. Historical `Log_Izin` can be incomplete (for example no class) and must still be preserved as history.
3. Two historical `Log_Izin` rows may share the same business identity. They remain separate source rows and should not be silently deduplicated.
4. Teacher names that no longer match `Master Guru` must remain as snapshots; foreign keys may be null.

## Behavior

### Classless room-only incidental

A row with:

- valid date,
- valid JP,
- known room,
- blank class,
- blank subject,
- no teacher override,

is no longer treated as a broken class schedule. It is planned into `room_unavailability` and produces a WARNING (`INCIDENTAL_ROOM_UNAVAILABILITY`).

Ambiguous classless rows that still contain a subject or teacher remain BLOCKING.

### Historical Log_Izin with blank class

The row is preserved in `coverage_slots` with:

- `source = LEGACY_IMPORT`,
- `class_id = null`,
- `class_name_snapshot = null` when the source class is truly blank.

The planner emits `LOG_CLASS_MISSING_HISTORY` as a WARNING.

For current/future workflow rows, class is still required by a database check constraint.

### Duplicate historical coverage identity

Duplicate date/class/JP/absent-teacher identities are WARNING-only. Distinct `legacy_log_id` rows are imported independently, preserving source history.

### Unknown teacher references

No change: names remain in snapshot columns and `teacher_id` may be null. This is intentional for renamed/transferred teachers and historical records.

## Database migration

Apply:

`202610070008_v3_6_1_legacy_exception_preservation.sql`

Then verify with:

`202610070009_v3_6_1_verify_legacy_exception_preservation.sql`

## Validation

- focused legacy migration tests: 28/28 pass in TRACE harness
- focused runtime assertions for room-only incidentals, incomplete Log_Izin, duplicate history: PASS
- syntax transpilation: 46 TS/TSX files, 0 diagnostics
- full local target after this patch: 102 tests, 0 fail

