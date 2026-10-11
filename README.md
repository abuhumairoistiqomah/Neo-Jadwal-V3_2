# E-Jadwal V3.14.5 — PNG Jadwal Guru + Hapus PDF Jadwal Kelas

Based on V3.14.4.3 (regression and TypeScript hotfixes retained).

- **Jadwal Lengkap**: **Unduh Jadwal Guru (PNG)** downloads the existing teacher's master weekly timetable, including name, JP total, legend, and all teaching periods (JP1–JP6; Monday–Friday). Export works at desktop and mobile widths, with a full-width PNG image. No duplicate teacher schedule is introduced in Dashboard.
- **Jadwal Kelas**: removed **Cetak / Simpan PDF (A4)** and its print handler. **Unduh Jadwal Kelas (PNG)**, **Jadwal Asli**, and **Minggu Ini** are retained unchanged.
- Label shortening is applied only to the cloned export text. Canonical Supabase rows are not modified.
- No new SQL migration, GAS redeploy, `.env.local` or OAuth changes.

**Release validation**: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` on Windows. See `TRACE_V3_14_5_TEACHER_PNG_AND_CLASS_PDF_REMOVAL.md`.

---

## Previous release history

# E-Jadwal V3.14.4 — Class Effective Week + Full-Width PNG

This corrected V3.14.4 is based on V3.14.3 and intentionally keeps teacher-schedule PNG **out of Dashboard Guru**. Teacher PNG will later be added to the existing teacher timetable in **Jadwal Lengkap**.

## Included

- Jadwal Kelas segmented mode: **Jadwal Asli** / **Minggu Ini**.
- `Jadwal Asli` renders canonical master schedule.
- `Minggu Ini` renders concrete effective schedule with incidental changes, leave/badal, and Kalender Akademik.
- Class PNG export follows the currently selected mode.
- Full-width PNG export expands horizontally scrollable table content so the rightmost JP column is included instead of being clipped by the visible viewport.
- Presentation-only compact subject labels for dense cells. Canonical Supabase values are unchanged.

## Not included in this release

- No new teacher timetable block in Dashboard Guru.
- No teacher PNG export yet. The next teacher-export work must reuse the existing **Jadwal Lengkap** teacher schedule.

## Upgrade

No SQL migration, Code.gs change, Apps Script redeploy, OAuth, or `.env.local` change is required.

Recommended Windows release gate:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

See `TRACE_V3_14_4_CLASS_EFFECTIVE_WEEK_FULL_PNG.md`.

---
# E-Jadwal V3.14.3 — Class PNG Export + Analytics Fix

This build is based on V3.14.2.2 and focuses on two release blockers before teacher-schedule image export:

- Management Analytics PostgreSQL `42803` GROUP BY repair.
- Lossless PNG export for Jadwal Kelas with export-only teacher-label expansion and higher raster resolution.

Run migrations `050` then `051`. No `Code.gs` redeploy is needed.

See `TRACE_V3_14_3_CLASS_PNG_ANALYTICS_FIX.md` for details.

---

# E-Jadwal V3.14.2.1

Urgent frontend wiring hotfix for `blocks_normal_teaching` in Input Guru Pengganti.

No new SQL migration and no Apps Script redeploy are required. V3.14.2 database migration must already be present.

Smoke test:
1. In **Aturan Guru Badal**, create/modify a DATE rule for a teacher, tick **Guru juga tidak bisa mengajar jadwal normal**, choose the date and JP range, then save.
2. Open **Input Inval (Admin)** for that same teacher/date.
3. Scheduled teaching/Homeroom periods in the selected range must show `× Izin (kelas) • alasan` in rose/red.
4. Genuine FREE periods remain `× Free`.
5. Untick the normal-teaching block and save; the same scheduled periods return to `✓ Mengajar (...)`.
# E-Jadwal V3.14.2

**JPG Isolation + Alternating Conflict Semantics + Normal-Teaching Restriction**

Upgrade from V3.14.1:

1. Keep the existing `.env.local`.
2. Run migration **048** then verifier **049** (target **8 / 8 TRUE**).
3. No `Code.gs` change and no Apps Script redeploy.
4. Run `npm install`, `npm test`, `npm run lint`, `npm run build`, then `npm run dev` (`npm.cmd` on Windows).

## What changed

- JPG export now renders in a **stylesheet-isolated iframe**. Tailwind v4 custom properties are not copied, so `html2canvas` no longer sees application `oklab()/oklch()` palette definitions.
- `ALTERNATING` master rows are no longer treated as simultaneous weekly conflicts in Jadwal Kelas, Quick Edit candidate warnings, or the static Conflict Center. Concrete dated incidentals are still checked normally.
- Permanent Quick Edit uses `ejadwal_update_schedule_master_v4`, which applies the same rotation-aware conflict semantics server-side.
- `substitute_constraints` gains `blocks_normal_teaching`.
- **Aturan Guru Badal** gets a checkbox **Guru juga tidak bisa mengajar jadwal normal**.
- When that checkbox is active for the selected date/JP, **Input Guru Pengganti** shows `× Izin (kelas) • alasan` instead of blue `✓ Mengajar (kelas)`.

## Migration

```text
202610100048_v3_14_2_export_alternating_constraint_hotfix.sql
202610100049_v3_14_2_verify_export_alternating_constraint_hotfix.sql
```

See `TRACE_V3_14_2_EXPORT_ALTERNATING_CONSTRAINT_HOTFIX.md` for design notes and smoke tests.
