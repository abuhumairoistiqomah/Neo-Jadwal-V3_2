# TRACE V3.7 — Dashboard Consumer Cutover (Shadow Mode)

## Goal

Move the first real UI consumer — `Dashboard` — onto the Supabase repository **without changing the normal application source yet**. V3.7 uses a staging-only shadow route so the same Dashboard component can be exercised with live Supabase data and compared against the current Apps Script source.

## Route

```text
http://localhost:3000/?supabase-dashboard=1
```

The normal route (`/`) remains Apps Script-backed.

## What changed

- Added `SupabaseDashboardCutover.tsx` staging diagnostic.
- It authenticates through Supabase Auth/RLS.
- It loads current Apps Script data with `?migration=1`, builds the normalized legacy migration plan, and converts that plan into the same domain snapshot contract used by the UI.
- It loads the live Supabase snapshot through `SupabaseScheduleRepository`.
- It compares **consumer-visible fields**, ignoring database UUID differences.
- If loading succeeds, the existing `Dashboard` component is rendered using the Supabase snapshot.
- Normal App/Dashboard remains unchanged until parity is accepted.

## Mapper hardening discovered before cutover

Dashboard needs more than schedule counts. V3.7 therefore closes three adapter gaps before the first consumer is allowed to use Supabase:

1. `Teacher` rows reconstruct legacy `wali_kelas`, `pendamping_kelas`, and `is_manajemen` behavior from `additional_task + notes`.
2. `coverage_slots` reconstruct `tugas` from `learning_tasks` / `task_resources`, so the Dashboard task modal does not silently lose content.
3. Historical coverage with nullable `class_id` uses `class_name_snapshot`, preserving readable legacy history.

## Parity strategy

Persistence IDs are intentionally ignored. The comparison uses multisets of normalized consumer fields for:

- teachers
- schedules
- logs / coverage
- incidentals
- rooms
- academic calendar

Multiset comparison is important because duplicate historical Log_Izin rows are intentionally preserved.

## Acceptance gate

V3.7 is ready to lock when:

```text
automated tests PASS
lint PASS
build PASS
CONSUMER PARITY PASS
Dashboard preview behaves correctly using Supabase data
```

A parity failure does **not** mutate either data source. It is a read-only diagnostic.

## Deliberately NOT changed

- Normal `/` route still uses Apps Script.
- Jadwal Kelas, Jadwal Ruangan, analytics, and Inval are not cut over yet.
- Apps Script write paths are untouched.
- Supabase becomes the source only inside the shadow Dashboard preview.

## Next

After V3.7 parity is accepted, the next step can safely make Supabase the default read source for Dashboard, then migrate the remaining consumers one by one.
