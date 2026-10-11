# TRACE V3.7.2 — Supabase Pagination Hardening

## Why this checkpoint exists

The V3.7.1 Jadwal Kelas shadow parity test exposed a real production-scale read bug:

- `teachers`: 99 / 99 — MATCH
- `rooms`: 28 / 28 — MATCH
- `schedules`: **1000 / 1682 — DIFF**

The exact 1,000-row boundary showed that the Supabase/PostgREST read adapter was treating a single `select("*")` response as a complete table snapshot. E-Jadwal has already outgrown that assumption:

- `schedule_master`: 1,682 rows
- `schedule_master_teachers`: 2,284 rows

This checkpoint fixes the repository rather than changing Spreadsheet data.

## Runtime changes

### 1. Shared pagination helper

Added:

`src/infrastructure/supabase/pagination.ts`

`fetchAllSupabasePages()` requests explicit inclusive ranges of 1,000 rows, appends each page, and stops only when the returned page is shorter than the requested page size.

### 2. Every canonical snapshot table is paginated

`SupabaseScheduleRepository.loadSnapshot()` now uses the pagination helper for:

- teachers
- classes
- rooms
- schedule_master
- schedule_master_teachers
- schedule_incidentals
- schedule_incidental_teacher_overrides
- academic_events
- coverage_slots
- learning_tasks
- task_resources

This avoids merely moving the 1,000-row bug from `schedule_master` to another growing table later.

### 3. Deterministic page ordering

Every paginated read has an explicit stable order. UUID/id-backed tables use `id`; relation tables use their composite keys:

- `schedule_master_teachers`: `schedule_id`, then `position`
- `schedule_incidental_teacher_overrides`: `incidental_id`, then `position`

This prevents offset pages from depending on unspecified database row order.

## Tests

Added `src/__tests__/supabase-pagination.test.ts` with regression coverage for:

1. 1,682 rows load across two pages.
2. 2,284 rows load across three pages.
3. Exact page multiples perform a final empty-page check and terminate.
4. Empty tables return an empty array.
5. Later-page errors propagate with the table label.

Expected full suite on the user's machine:

- tests: **125**
- pass: **125**
- fail: **0**

## No database migration

V3.7.2 changes only the browser read adapter. There is no new Supabase SQL migration and no data re-import.

## Verification target

Run the existing V3.7.1 Jadwal Kelas shadow route:

`http://localhost:3000/?supabase-jadwal-kelas=1`

Expected parity counts:

- teachers: 99 / 99 — MATCH
- schedules: 1682 / 1682 — MATCH
- masterRuangan: 28 / 28 — MATCH

Final target:

`JADWAL KELAS PARITY PASS`

## Performance note

This fix prioritizes correctness. It still downloads a complete canonical snapshot for shadow-mode comparison. Query minimization/caching remains a later performance task after consumer cutover stabilizes.
