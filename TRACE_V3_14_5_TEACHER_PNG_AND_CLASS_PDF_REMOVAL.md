# E-Jadwal V3.14.5 — Teacher PNG + Class PDF Removal

Baseline: V3.14.4.3 (all prior frontend logic, tests, Supabase, and GAS untouched except changes below).

## Changes

- `src/components/JadwalLengkap.tsx`: **Unduh Jadwal Guru (PNG)** button in the EXISTING weekly teacher timetable. It clones the on-screen teacher summary, legend, and canonical desktop grid, adds a school heading, forces the export-only grid visible even for mobile widths, sanitizes download filename, and reuses the established isolated PNG capture helper. `Jadwal_Guru_<name>.png`. The dashboard is not given a duplicate grid.
- `src/components/JadwalKelas.tsx`: removed **Cetak / Simpan PDF (A4)** button and `handlePrintPDF` implementation. Kept existing Jadwal Asli / Minggu Ini mode and class PNG as-is.
- `src/__tests__/v3-14-5-teacher-png-class-pdf-removal.test.ts`: regression assertions for wiring, stable functionality, scope guardrails.
- `package.json` / `package-lock.json`: version metadata 3.14.5; test scripts include new regression test.

## Operational meaning

PNG Guru mirrors the **master weekly teaching grid** already visible in Jadwal Lengkap (Mon–Fri, JP1–JP6, distinct class grouping, conflict and alternating/companion badges). It is NOT a current-week badal/izin/calendar schedule. A small description in the UI makes this explicit. JP0 is not added to this existing grid.

Export-only compact class/subject labels do not mutate canonical Supabase values or the live table. It uses the isolated `downloadElementAsPng` helper for Tailwind v4 CSS compatibility and full-width capture. The off-screen host is separate from the captured element to avoid baking a negative position into the exported image.

## No deployment changes

No SQL, GAS, .env, Supabase, or OAuth updates required. No production migrations.

## Local release gate

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Manual smoke: choose teacher AFIK in Jadwal Lengkap, click PNG; verify the school heading, teacher name, 22 JP badge, color legend, and all six JP columns through Friday. Also check under narrow/mobile viewport. Verify Jadwal Kelas only offers class PNG, with Jadwal Asli / Minggu Ini still working.
