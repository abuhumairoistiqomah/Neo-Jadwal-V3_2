# E-Jadwal V3.3 — Canonical Effective Schedule Engine

Status: **domain engine introduced; existing screens are not migrated yet**.

V3.3 establishes one canonical interpretation of a schedule on a concrete calendar date. The legacy Dashboard, Inval, and Room screens still use their existing logic in this checkpoint; this keeps visible behavior stable while the new engine is tested independently.

## Canonical merge order

```text
Jadwal Master
  ↓
Jadwal_Insidental
  ↓
Log_Izin / guru badal
  ↓
Kalender_Akademik
  ↓
EffectiveScheduleItem[]
```

The implementation lives in:

- `src/domain/schedule/effectiveSchedule.ts`

The main entry point is:

```ts
buildEffectiveScheduleForDate(...)
```

## Rules locked in V3.3

### 1. Date + class + JP is the incidental identity

Mapel is deliberately **not** part of the match identity. An incidental can therefore change the mapel without becoming an unrelated extra row.

### 2. Incidental overrides are field-level inheritance

For a matched master row, a non-blank incidental value overrides the matching field. A blank value inherits the master value.

This applies to:

- `mapel`
- `guru1` through `guru6`
- `kelasgabung`
- `ruangan`
- `keterangan_khusus`

This intentionally defines the correct future behavior for the known legacy bug where some screens treat blank `guru2`-`guru6` as an instruction to erase the master teacher.

### 3. Unmatched incidentals are additional sessions

An incidental with no matching master class + JP on that date becomes an `INCIDENTAL_ADDITIONAL` row. JP time is derived from the shared `JAM_TIME_MAP`.

### 4. Leave and substitute logs annotate the resolved schedule

For each matching date + class + JP:

- `guru_izin` is removed from `effectiveTeachers`;
- `guru_pengganti`, when present, is added;
- team teachers who are not absent stay active;
- duplicate teacher names are collapsed case-insensitively;
- task/reason/log IDs stay attached as substitution metadata.

The underlying post-incidental teacher fields (`guru1..guru6`) are preserved for auditability. Consumers should use `effectiveTeachers` when they need the actual covering teachers.

### 5. Kalender Akademik is the final gate

Calendar events are evaluated after incidental and leave/badal processing.

Affected rows are **not deleted**. Instead they carry:

```text
academicEvent
isSuppressedByAcademicCalendar = true
isActive = false
```

This lets UI screens explain *why* a normal lesson does not occur instead of losing the original schedule context.

`getActiveEffectiveSchedules()` is provided for consumers that only want active KBM rows.

## Derived fields on `EffectiveScheduleItem`

The engine adds:

- `tanggal`
- `source`
- `masterId`
- `incidentalId`
- `incidentalReason`
- `incidentalType`
- `scheduledTeachers`
- `absentTeachers`
- `substituteTeachers`
- `effectiveTeachers`
- `substitutions`
- `logIds`
- `academicEvent`
- `isSuppressedByAcademicCalendar`
- `isActive`

## Safety tests

V3.3 adds `src/__tests__/effective-schedule.test.ts` with 19 engine tests covering:

- real weekday selection;
- date normalization;
- master baseline;
- mapel-changing incidental override;
- blank-field inheritance including `guru2`-`guru6`;
- room-only incidental;
- selective teacher override;
- standalone incidentals;
- izin without badal;
- izin with badal;
- team-teaching preservation;
- wrong class/JP log isolation;
- substitute deduplication;
- partial calendar events;
- full-day calendar events;
- JP 0;
- active-row filtering.

TRACE-environment verification of the new engine suite:

```text
engine tests 19
pass 19
fail 0
```

Together with the already locked V3.2 baseline suite, the normal project test command should report **53 passing tests**.

## Intentionally not changed yet

V3.3 does **not** migrate any screen to the new engine yet. Therefore it does not intentionally change:

- Dashboard rendering;
- Jadwal Kelas rendering;
- Jadwal Ruangan calculations;
- Input Inval recommendation behavior;
- weekly workload calculations;
- room conflict calculation;
- Google Apps Script (`Code.gs`);
- database/API format;
- authentication/security;
- visible UI design.

This separation is deliberate: first prove the canonical engine, then move consumers one at a time.

## Known follow-up work

1. Migrate Dashboard Kelas/Guru to the canonical engine and compare output against the golden scenarios.
2. Migrate Jadwal Ruangan and retire its local schedule-merge logic.
3. Rebuild Inval availability/load calculations from precomputed effective-schedule indexes.
4. Add stable operational IDs/audit foundations before new leave-approval workflow work.
5. Keep the existing bundle-size warning as a separate performance task; V3.3 does not attempt code splitting.

## Verification commands

Run in the full V3.3 project folder:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected test target:

```text
53 pass
0 fail
```
