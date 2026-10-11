# TRACE V3.14.2 — Export, Alternating & Constraint Semantics Hotfix

## Scope

V3.14.2 closes three production-facing issues found after V3.14.1:

1. JPG capture still failed because `html2canvas` could parse Tailwind v4 `oklab()` values from the parent application stylesheet/custom properties.
2. `ALTERNATING` master rows were still reported as weekly collisions even though the master does not encode which rotation week is active.
3. Substitute restrictions could block badal selection but could not express that the teacher is also unavailable for their own normal lesson.

## JPG export hard boundary

The export pipeline now:

```text
live timetable
  -> deep clone
  -> copy resolved computed styles only
  -> drop every CSS custom property (--*)
  -> convert remaining OKLAB/OKLCH values
  -> import clone into blank hidden iframe
  -> iframe has no Tailwind/application stylesheet
  -> html2canvas
  -> JPEG blob/download
```

`data-export-ignore="true"` nodes are removed from the export tree, so admin pencil buttons are not captured.

## ALTERNATING semantics

A weekly master row with `class_mode=ALTERNATING` means the represented sessions occur on different rotation weeks. Without a concrete dated occurrence, concurrency cannot be proven.

Therefore static checks exclude ALTERNATING rows from:

- Jadwal Kelas red conflict semantics,
- Quick Edit teacher candidate warnings,
- permanent Quick Edit class/teacher/room collision checks,
- Conflict Center static master scan.

Date-specific incidentals remain strict because the date is concrete.

## Restriction scope

`substitute_constraints.blocks_normal_teaching` defaults to `false` for backward compatibility.

- `false`: rule affects substitute candidacy only.
- `true`: rule also marks the teacher unavailable for their own normal lesson on matching JP/date.

This does **not** manufacture a Leave Request. It is an operational availability rule used by Input Guru Pengganti. The underlying normal schedule remains canonical, so the operator can still generate the required replacement row for that class.

## Expected verifier

Migration 049 target: **8 / 8 TRUE**.

## Smoke tests

1. Open Jadwal Kelas and export JPG; no `oklab/oklch` parser error should appear and the table should download as `.jpg`.
2. Mark a weekly slot `Pelajaran Bergantian / Rotasi`; after refresh it should remain violet `BERGANTIAN`, not red `BENTROK`.
3. Add Aturan Guru Badal for a teacher/date/JP, enable **Guru juga tidak bisa mengajar jadwal normal**, then open Input Guru Pengganti for that teacher/date. Matching teaching JP should show red `× Izin (kelas) • alasan`.
4. Leave the checkbox off on another restriction; normal teaching remains blue `✓ Mengajar`, while the teacher is still constrained as a badal candidate according to HARD/SOFT level.
