# TRACE V3.9 — Jam Kosong / Availability Consumer Cutover

## Goal
Move the three legacy Jam Kosong read views to a Supabase shadow route while preserving their current semantics exactly before the more complex Inval engine is cut over.

## Consumers covered
1. `JamKosongIndividu`
2. `TabelJamKosong`
3. `JamKosongSemua`

All three currently derive their output directly from:

```text
Master Guru + recurring Jadwal
```

Therefore the parity gate intentionally compares exactly:

```text
teachers
schedules
```

## New route

```text
/?supabase-availability=1
```

The route:
- requires Supabase Auth;
- fetches the Apps Script migration snapshot;
- loads the full paginated Supabase snapshot;
- compares `teachers` and `schedules` using the shared multiset parity engine;
- exposes three tabs that render the existing Jam Kosong components with Supabase data;
- performs no writes.

## Why we do not include Log Izin / calendar / incidentals here
This is a storage cutover checkpoint, not a hidden business-rule rewrite. The existing Jam Kosong components do not consume those sources today. Including them only in the parity gate would not prove they affect the UI, while changing the UI now would destroy legacy parity.

The next Inval-stage availability engine will explicitly combine:

```text
recurring schedule
+ incidental teacher changes
+ academic calendar
+ izin
+ assigned badal
+ substitute soft constraints
```

That engine will become the source for recommendation/heatmap logic after dedicated tests.

## Regression tests added
V3.9 adds 5 tests covering:
- exact consumer section selection;
- teacher-master mismatch detection;
- schedule-teacher mismatch detection;
- intentional exclusion of non-consumer sections;
- harmless case/whitespace normalization.

Target full suite:

```text
144 pass
0 fail
```

## Manual smoke checklist after `JAM KOSONG PARITY PASS`
### Jam Kosong Individu
- choose several teachers with dense and sparse schedules;
- switch day filters;
- inspect an ITBA / supervising case if available;
- check that the free-slot count agrees with the legacy page.

### Tabel Jam Kosong
- switch Senin–Jumat;
- inspect several rows near the top/middle/bottom of the teacher list;
- check free / teaching / pendamping colors;
- use teacher/mapel search.

### Jam Kosong Semua
- test at least three different day/JP combinations;
- confirm displayed free-teacher count is plausible;
- search by name and mapel;
- inspect ITBA/task-additional labels if present.

## Gate
Lock V3.9 only when:
- automated suite passes;
- TypeScript lint passes;
- production build passes;
- live route shows `TEACHERS MATCH` and `SCHEDULES MATCH`;
- `JAM KOSONG PARITY PASS` appears;
- all three Supabase previews behave like the legacy views.
