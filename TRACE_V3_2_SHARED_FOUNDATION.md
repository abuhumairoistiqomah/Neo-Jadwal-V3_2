# E-Jadwal V3.2 — Shared Foundation Extraction

Status: **structural refactor only**. V3.2 starts dismantling the V2/V3 monolith while preserving the V3.1 behavioral baseline.

## What changed

### 1. `src/types.ts` is no longer a 700+ line mixed-responsibility file

It is now a small compatibility facade. The existing public names remain available from `types.ts`, so screens do not need a risky all-at-once migration.

Canonical data interfaces now live in:

- `src/domain/models.ts`

Pure/domain helpers are separated into:

- `src/domain/date.ts`
- `src/domain/class.ts`
- `src/domain/room.ts`
- `src/domain/teacher.ts`
- `src/domain/calendar.ts`

UI-specific task-link rendering moved to:

- `src/ui/taskLinks.tsx`

### 2. Schedule constants have one owner

Created:

- `src/constants/schedule.ts`

It owns:

- `JAM_TIME_MAP`
- Monday-Friday school-day list
- JP 1-6 list
- weekday sort order
- recommended weekly substitute threshold (24 JP)

`JAM_TIME_MAP` is no longer exported by `Dashboard.tsx`. Consumers import it from the shared constants module instead, eliminating the old UI-component dependency.

### 3. Removed safe, exact duplicates

The exact same `isGrade1Or2()` implementation previously existed in:

- `Dashboard.tsx`
- `JadwalKelas.tsx`
- `JadwalLengkap.tsx`

It now lives once in `src/domain/class.ts`.

Likewise, identical `HARI_LIST`, `JAM_LIST`, and `HARI_ORDER` definitions were replaced by shared constants.

## Safety verification

The original V3.1 characterization suite remains intact and two tests were added specifically for the extracted grade helper.

Direct domain verification in the TRACE environment:

```text
tests 34
suites 10
pass 34
fail 0
```

Official project verification should still be run in the normal project environment:

```bash
npm test
npm run lint
npm run build
```

## Intentionally NOT changed

V3.2 does not change:

- effective-schedule merge behavior;
- `Jadwal` / `Jadwal_Insidental` semantics;
- `Log_Izin` behavior;
- room-conflict rules;
- teacher recommendation scoring;
- Apps Script (`Code.gs`);
- API endpoints;
- authentication/security behavior;
- visible page design.

## Known debt deliberately left for later

1. `JadwalRuangan.tsx` still contains a local, looser `isClassMatch()` used when pairing room incidentals with master rows. It is intentionally not replaced in V3.2 because its behavior is not yet protected by a component-level characterization test.
2. Effective schedule construction still exists in multiple screens.
3. Incidental teacher inheritance is still inconsistent in legacy paths, particularly blank `guru2`-`guru6` handling.
4. Inval recommendation still performs expensive repeated scans during rendering.
5. Security/auth remains the V2-era implementation.
6. Production bundle chunk-size warning remains a recorded performance debt.

## Next planned checkpoint

**V3.3 — Canonical Effective Schedule Engine foundation**

Before consumers are migrated, the engine should be introduced as a pure domain layer and tested against explicit master + incidental + leave + calendar scenarios.
