# TRACE V3.6.2 — Migration Hardening

## Why this checkpoint exists

The first real Spreadsheet → Supabase import exposed one schema mismatch that the synthetic fixtures could not reveal: two historical `Log_Izin` rows can intentionally share the same business identity (date + class + JP + absent teacher). V3.4's active coverage unique index rejected the second row even though V3.6.1 deliberately preserved both rows as historical records.

V3.6.2 converts the manual recovery performed during the live import into repeatable source-controlled migrations and strengthens post-import verification.

## Permanent database rule

`coverage_slots_active_identity_uidx` now protects only operational V3 coverage rows. `LEGACY_IMPORT` rows are excluded from that business-identity uniqueness rule and remain uniquely anchored by `legacy_log_id`.

Operational rows therefore remain protected from duplicate active badal assignments, while historical spreadsheet duplicates remain importable without falsifying history.

## New migrations

- `202610070010_v3_6_2_migration_hardening.sql`
  - drops/recreates `coverage_slots_active_identity_uidx`;
  - excludes `source = 'LEGACY_IMPORT'`;
  - is safe to run after the same fix was already applied manually.
- `202610070011_v3_6_2_verify_migration_hardening.sql`
  - verifies the hardened index predicate;
  - verifies the `legacy_log_id` unique index;
  - confirms no duplicate active operational coverage exists;
  - confirms no duplicate `legacy_log_id` exists;
  - confirms RLS remains enabled;
  - confirms the V3.6.1 live-class constraint remains present.

## Stronger application parity verification

`Verify Parity` still compares source-plan counts to imported rows, but now also compares total rows wholly managed by the migration pipeline. This catches stale rows that keyed verification alone can miss after a source row is deleted.

Strict managed totals are checked for:

- `schedule_master` rows with `legacy_row_id`;
- `schedule_incidentals` rows with `legacy_row_id`;
- `academic_events` rows with `legacy_row_id`;
- `coverage_slots` where `source = LEGACY_IMPORT`;
- `room_unavailability` where `source = LEGACY_INCIDENTAL`.

Teachers are intentionally not included in strict stale-total comparison because removed legacy teachers are retained as inactive master/history references rather than deleted.

## TypeScript boundary fix

The Supabase dynamic select used during stale cleanup is narrowed once to `Array<Record<string, unknown>>`. This fixes the `ParserError` inference seen on Windows `tsc --noEmit` without changing runtime behavior.

## Scope intentionally NOT changed

- No consumer is cut over to Supabase yet.
- No normal Dashboard/Inval behavior changes.
- No production database is touched by the source package.
- Google Drive remains the planned file store.
- The migrated data already verified in V3.6.1 does not need to be imported again merely because V3.6.2 is applied.


## Locked staging snapshot observed before this hardening checkpoint

The live V3.6.1 import completed Phase 8/8 and returned `VERIFY PASS` with this staging snapshot:

```text
teachers                    99
classes                    114
rooms                       28
roomUnavailability           0
schedules                  1682
scheduleTeachers           2284
incidentals                 705
incidentalTeacherOverrides  924
academicEvents              249
coverageSlots               960
learningTasks               296
taskResources               122
```

These counts are the parity reference for the current migrated snapshot. A later intentional source refresh may change them; if that happens, the new snapshot must pass `Verify Parity` again before consumer cutover.

## Validation target

V3.6.1 had 102 tests. V3.6.2 adds 3 migration-hardening tests.

Expected local checkpoint:

```text
tests 105
pass 105
fail 0
lint PASS
build PASS
```

For an existing Supabase staging project, apply migration `010`, run verifier `011`, then run the application `Verify Parity` once. If all are green, V3.6.2 is locked and the project can proceed to consumer cutover.
