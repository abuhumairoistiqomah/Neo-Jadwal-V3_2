# TRACE V3.5.2 — Substitute Availability Constraints

## Goal

Add the "soft ban badal" concept before real Spreadsheet data is migrated to Supabase.

This rule is **not** a teaching schedule and **not** a leave record. It answers a narrower question:

> A teacher looks free according to the effective schedule. Is there another operational reason why this teacher should normally not be selected as a substitute at this date/JP?

Example:

```text
Yusril
Recurring: Monday JP 5–6
Reason: Kuliah
Override allowed: YES
```

The recommendation engine should therefore treat him as `SOFT_BLOCKED` for those slots, but Wakasek/Admin can still intentionally assign him.

## Domain states

The resolver in `src/domain/substituteAvailability.ts` returns:

- `AVAILABLE` — no matching special constraint.
- `SOFT_BLOCKED` — one or more matching constraints, all may be overridden.
- `HARD_BLOCKED` — reserved foundation for a future non-overridable rule. V3.5.2 operational rows are expected to use `override_allowed = true`.

This resolver intentionally does **not** decide ordinary schedule conflicts, leave, calendar events, gender preference, daily load, or weekly load. Those are separate signals that will be composed later by the Inval recommendation engine.

## Constraint types

### WEEKLY

For recurring rules.

Fields:

```text
teacher_id
constraint_type = WEEKLY
day_of_week      Monday=1 ... Sunday=7; NULL = every day
period_start
period_end
valid_from       optional
valid_until      optional
reason
override_allowed
```

A finite validity window supports semester-specific commitments without deleting history.

### DATE

For one-off rules.

Fields:

```text
teacher_id
constraint_type = DATE
specific_date
period_start
period_end
reason
override_allowed
```

`day_of_week`, `valid_from`, and `valid_until` are intentionally null for DATE rules.

## Database changes

Migration:

`supabase/migrations/202610050004_v3_5_2_substitute_constraints.sql`

Adds:

1. `substitute_constraints`
2. `coverage_constraint_overrides`

The second table preserves evidence that a staff member deliberately crossed a matching constraint when assigning a concrete coverage slot. A coverage slot can match multiple constraints, so the relationship is one row per `(coverage_slot, constraint)`.

## RLS

`substitute_constraints`:

- anonymous: no privileges
- TEACHER: may read own active/non-deleted constraints
- WAKASEK: may read/manage all
- ADMIN: may read/manage all

`coverage_constraint_overrides`:

- anonymous: no privileges
- TEACHER: no direct access
- WAKASEK / ADMIN: read/manage

The existing `current_user_is_staff()` and `current_user_teacher_id()` helpers remain the authorization source.

## Recommendation semantics later

The intended future ordering is:

```text
ordinary hard availability / schedule conflict
        ↓
substitute constraint
        ↓
gender preference
        ↓
subject/rumpun suitability
        ↓
daily load
        ↓
weekly load
```

A `SOFT_BLOCKED` candidate should normally be removed from the default recommendation shortlist or pushed into a clearly marked restricted section, while remaining manually selectable.

On override, the UI should show the reason and require an explicit action such as:

```text
⚠ Pembatasan Badal: Kuliah (JP 5–6)
[Tetap pilih guru ini]
```

The eventual assignment service will insert `coverage_constraint_overrides` and emit an `audit_logs` event.

## What V3.5.2 intentionally does NOT do

- No new visible management UI yet.
- No change to the existing Apps Script data path.
- No candidate-ranking integration yet.
- No Spreadsheet migration yet.
- No changes to Dashboard/JadwalRuangan/InputGuruPengganti.
- No production data inserted by this package.

This keeps V3.5.2 a small domain + persistence checkpoint before V3.6 migration.

## Tests

Adds 12 tests covering:

- ISO weekday calculation
- invalid date protection
- recurring weekday rule
- recurring all-day rule (`day_of_week = null`)
- JP range matching
- recurring validity window
- date-specific rule
- JP 0
- inactive constraints
- soft/hard precedence
- Supabase row mapping

Expected total:

```text
74 pass
0 fail
```

## Supabase staging steps

1. Run `202610050004_v3_5_2_substitute_constraints.sql` in SQL Editor.
2. Run `202610050005_v3_5_2_verify_substitute_constraints.sql`.
3. Confirm both new tables report `rowsecurity = true` and the four expected policies exist.
4. Do not add real constraint rows until the migration is verified.

