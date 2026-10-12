# E-Jadwal V3.14.6 RC3.4.9.1 — Flexible Dated Syaikh Ali Import

## Decision

Syaikh Ali is not assumed to follow a strict A→B weekly rotation. Holiday, absence,
late decisions, incomplete coverage, or teacher-team swaps must not move next week's
schedule automatically. Existing **Syaikh Manshur Native/Normal importer is untouched**.

## User operation

`Import Jadwal Syaikh → Import Fleksibel Syaikh Ali — TSV Bertanggal`

The canonical input is one editable **14-column TSV** with actual dates:
`Tanggal, kelas, jamke, mata pelajaran, guru1..guru6, keterangan khusus,
Alasan, Tipe_Insidental, ruangan`.

- Paste actual dated TSV **directly** (including several non-consecutive weeks).
- Optional A/B reference templates can prefill a **single explicitly selected week**.
  Every class/day/JP is individually selectable as **A / B / Lewati**. Default is
  **Lewati**; no parity inference, catch-up, automatic weekly generation, or
  carryover of selections to the next week.
- Click **Tambahkan Pilihan ...** to append exactly the selected entries to the
  dated TSV. Modify rows/teachers/mapel manually before preview.
- Click **Analisis Jadwal Aktual** for validation and Preview. Then an ADMIN can
  publish only those dated rows via the existing Supabase Syaikh RPC.
- SKIP means no incidental is created. It does **not** cancel or hide master. Use
  Kalender Akademik or appropriate cancellation workflow for a class holiday.
- A/B need not both include all class/day/JP pairs.

## Safeguards

- Verify master class, actual weekday/JP, unique teacher or alias, explicit teams.
- Block duplicate date+class+JP and other incidental ownership.
- Block rotations attributed to other Syaikh or unidentifiable owners.
- Room column in batch is NOT persisted by existing Syaikh RPC; warn and edit room
  via Jadwal Ruangan if required.
- Warn possible duplicate teacher at the same time; do not silently ignore conflicts.
- Master schedule stays unchanged. No SQL migration is introduced in this release.
- RC3.4.9 compact Edit/Hapus actions in Log Izin & WA are retained unchanged.

## Verification / release gate

Targeted Node domain tests, isolated domain TS typecheck and TS/TSX parse are run
in preparation. Full npm `test`, `lint`, `build`, SQL live and browser staging
remain release gates. Stage-test first before publishing to Vercel.
