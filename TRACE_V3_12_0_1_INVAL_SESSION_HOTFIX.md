# TRACE V3.12.0.1 — Inval Session Grouping + JP-Scoped Leave Hotfix

## Scope

This hotfix closes two operational defects found during live V3.12 verification:

1. A teacher with leave recorded for one JP was incorrectly blocked as a substitute for the entire day.
2. Explicitly combined classes could require duplicate operator rows when assigning one substitute.

No Supabase schema migration is required.

## Fix A — leave availability is period-scoped

Before:

```text
Teacher has leave in JP2
-> recommendation index marks teacher absent for the date
-> JP1..JP6 all become unavailable
```

Now:

```text
Teacher has leave in JP2
-> absentJamKeByTeacher[teacher] = {2}
-> JP2 blocked
-> JP1 / JP3 / JP4 / JP5 / JP6 remain eligible subject to normal conflicts
```

The verification modal uses the same JP-specific rule. UI wording is now **Guru Izin pada JP Ini**.

## Fix B — combined classes become one operator session

Only rows explicitly marked `COMBINED` / legacy `kelasgabung = Ya/Iya` are grouped.

Example:

```text
JP3 | 05 MQ IKHWAN | Tahsin | Guru A | COMBINED
JP3 | 05 MQ AKHWAT | Tahsin | Guru A | COMBINED
```

Operator UI:

```text
JP3 | 05 MQ IKHWAN + 05 MQ AKHWAT | Tahsin
```

The selected substitute and task are entered once.

Persistence intentionally remains per real class:

```text
coverage/log 1 -> 05 MQ IKHWAN
coverage/log 2 -> 05 MQ AKHWAT
```

This preserves class IDs, audit history, statistics, effective-schedule behavior, and legacy compatibility.

Normal or alternating rows are never merged merely because they occur in the same JP. Combined rows with different subjects also remain separate.

For a mixed Ikhwan+Akhwat combined row, substitute gender ranking becomes neutral (`UNKNOWN`) instead of accidentally preferring one side.

## Additional guard

If two separate operator sessions occur in the same JP, one substitute selected in the first session becomes ineligible in the second session for that same JP. Projected load also counts unique JP, not duplicate class rows.

## Room relocation

A grouped multi-class Inval row cannot currently be bundled with one room-relocation write because the V3.11 room payload represents one class. The UI blocks that combination with an explicit message rather than silently relocating only one class.

## Regression coverage

Added `src/__tests__/inval-session-grouping.test.ts` covering:

- explicit combined class grouping;
- normal-class non-grouping;
- different-subject separation while allowing different room records;
- expansion of one grouped UI row into per-class persistence rows.

Updated `inval-performance.test.ts` to assert JP-scoped leave indexing.

Expected full suite: **176 tests**.

## Local verification

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Manual checks:

1. Record Guru A absent in JP2 only.
2. Open Input Inval for JP4 and verify Guru A can still be selected if otherwise free.
3. Open Input Inval for JP2 and verify Guru A appears under **Guru Izin pada JP Ini** and cannot be selected.
4. Generate an Inval row for an explicit combined session such as `05 MQ IKHWAN` + `05 MQ AKHWAT`.
5. Verify only one operator row appears.
6. Select one substitute and save.
7. Verify two underlying class coverage/log rows are persisted with the same substitute.
