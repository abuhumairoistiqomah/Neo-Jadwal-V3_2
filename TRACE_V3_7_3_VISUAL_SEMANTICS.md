# TRACE V3.7.3 — Jadwal Kelas Visual Semantics Restoration

## Why this checkpoint exists

V3.7.2 achieved full Jadwal Kelas parity after fixing the 1,000-row Supabase pagination limit, but the timetable cells had regressed to one generic blue style. The old operational color semantics were no longer visible.

V3.7.3 restores semantic timetable colors and makes the underlying class-mode data explicit in PostgreSQL so `Bergantian` is not lost during migration.

## Visual rules

Priority is evaluated in this order:

1. `SUBSTITUTE` — yellow — an assigned guru badal exists for the current week's date/class/JP.
2. `CONFLICT` — red — a teacher is assigned to multiple classes in the same day/JP without a consistent combined/alternating rule.
3. `ALTERNATING` — violet — legacy `kelasgabung = Bergantian`.
4. `COMBINED` — light green — legacy `kelasgabung = Ya/Iya`.
5. `NORMAL` — blue.

Break/Ishoma colors remain unchanged.

The same semantics are applied to desktop cells, Friday cells, and mobile cards. Non-normal cells also show a short label (`Badal`, `Bentrok`, `Bergantian`, `Gabung`).

## Badal semantics

`JadwalKelas` now accepts `logs` and marks a cell yellow only when a `Log_Izin` row:

- falls in the current school week,
- matches the selected class,
- matches the JP,
- and has a nonblank `guru_pengganti`.

The cell displays the substitute teacher name rather than silently continuing to show only the master teacher.

## Class-mode preservation

The original Supabase schema stored only `is_combined boolean`. That was enough for `Ya/Iya`, but it collapsed legacy `Bergantian` into `false`, making alternating classes indistinguishable from normal classes after migration.

V3.7.3 adds:

- `schedule_master.class_mode` — `NORMAL | COMBINED | ALTERNATING`
- `schedule_incidentals.override_class_mode` — nullable override with the same values

The legacy boolean remains for backward compatibility.

Migration mappings now preserve:

- `Ya/Iya` -> `COMBINED`
- `Bergantian` -> `ALTERNATING`
- other/nonblank normal values -> `NORMAL`

## Database migration

Run:

`supabase/migrations/202610070012_v3_7_3_schedule_visual_semantics.sql`

Then verify with:

`supabase/migrations/202610070013_v3_7_3_verify_schedule_visual_semantics.sql`

Existing combined rows are reconstructed immediately from `is_combined`. Existing alternating rows cannot be reconstructed from the old boolean schema, so the repeatable legacy migration must be rerun once after the SQL migration to repopulate `class_mode` from the Spreadsheet source.

No manual table editing is required.

## Shadow parity expansion

Because Jadwal Kelas now consumes current-week `Log_Izin` to render badal colors, the shadow route compares four sections:

- teachers
- schedules
- masterRuangan
- logs

Expected parity is therefore four green cards.

## Tests

New visual-semantics coverage checks:

- combined parsing
- alternating parsing
- teacher conflict detection
- intentional combined overlap does not become a false conflict
- current-week badal lookup
- badal priority over conflict
- preservation of `Bergantian` through the migration plan
- Log Izin is now part of Jadwal Kelas parity

Expected full suite on the user's machine:

- tests: **134**
- pass: **134**
- fail: **0**
