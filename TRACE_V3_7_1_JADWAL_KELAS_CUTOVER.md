# TRACE V3.7.1 — Jadwal Kelas Consumer Cutover

## Goal

Move the second read-only consumer, `JadwalKelas`, onto the live Supabase repository in an isolated shadow route while keeping normal E-Jadwal on the legacy Apps Script path.

## Scope

New diagnostic route:

```text
http://localhost:3000/?supabase-jadwal-kelas=1
```

The route:

1. signs in through Supabase Auth;
2. loads the latest legacy source through Apps Script `?migration=1`;
3. loads the live Supabase schedule snapshot;
4. compares only data consumed directly by `JadwalKelas`:
   - teachers;
   - schedules;
   - masterRuangan;
5. renders the existing `JadwalKelas` component with the Supabase snapshot.

## Read-only by design

`JadwalKelas` has existing admin-edit behavior. V3.7.1 intentionally passes `isAdmin={false}` and no `onUpdateSchedules` callback in the shadow route, so this checkpoint verifies the read path only. Supabase write/cell-edit cutover remains deferred.

## Parity hardening

`snapshotParity.ts` now supports comparing an explicit subset of snapshot sections via:

```ts
compareScheduleDataSnapshotSections(...)
```

The original full Dashboard parity helper still compares all sections and remains backward-compatible.

Parity normalization trims values, collapses repeated whitespace, and compares case-insensitively. Harmless name whitespace/casing therefore does not create a false mismatch.

## Tests

V3.7.1 adds four tests covering:

- matching Jadwal Kelas consumer sections;
- missing recurring schedule detection;
- room-master mismatch detection;
- whitespace/case normalization for teacher identity fields.

Expected full test total:

```text
120 pass
0 fail
```

## Intentionally deferred

- production/default source switch;
- Supabase write support from Jadwal Kelas;
- performance optimization and caching;
- Jadwal Ruangan cutover;
- Inval cutover.

## Manual verification

Run:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Open:

```text
http://localhost:3000/?supabase-jadwal-kelas=1
```

Login with a staging authenticated account, click **Load + Compare**, and expect:

```text
JADWAL KELAS PARITY PASS
```

Then manually inspect several classes, including classes with team teaching, room IDs, Friday timing, Grade 1/2 timing, and multiple schedule rows in the same JP.
