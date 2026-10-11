# TRACE V3.14.4 — Class Effective Week + Full-Width PNG

## Scope correction
V3.14.4 does **not** create a second teacher-timetable surface in Dashboard Guru. Teacher PNG export will later attach to the existing **Jadwal Lengkap** teacher schedule.

This release focuses on Jadwal Kelas:

1. Segmented **Jadwal Asli / Minggu Ini** view.
2. `Jadwal Asli` reads canonical weekly master rows.
3. `Minggu Ini` composes master + incidental + leave/badal + academic calendar for concrete dates.
4. PNG export follows the active view mode.
5. PNG export expands horizontally scrollable desktop timetable content before rasterization, so the rightmost column is not clipped by the interactive viewport.
6. Dense subject labels may be compacted for presentation only; canonical database values are unchanged.

## Export fix
The timetable scroll wrapper is marked with `data-export-expand-scroll="true"`.
The isolated export pipeline measures the marked node's `scrollWidth`, expands the cloned wrapper, and expands the capture root before `html2canvas` renders it. The live browser UI can remain horizontally scrollable while exported PNG contains the full table.

## Database / GAS
No SQL migration. No Code.gs change. No GAS redeploy.

## Smoke tests
- Jadwal Asli shows the master teacher even when a badal exists this week.
- Minggu Ini shows the badal / incidental / academic event state.
- Export each mode and confirm the filename and header match the selected mode.
- Confirm the rightmost JP column is fully visible in PNG.
- Dashboard Guru must not contain a new teacher timetable/export block.
