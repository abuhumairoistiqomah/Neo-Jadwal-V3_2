# V3.14.6 RC3.4.9 — Rotasi Tahsin A/B + Log Izin Buttons

Base: RC3.4.8.3.1. No database migration. **STAGING ONLY until Windows gate and Supabase publish verified.**

## New workflow

Admin → Import Jadwal Syaikh → 'Mode baru: Rotasi Tahsin A/B dari format TSV lama'.

- Paste full 14-column header+rows in Scenario A and Scenario B. Original `Tanggal` only determines weekday; the "Senin awal rotasi" controls real dates.
- A and B must contain exactly matching *class + weekday + JP* keys. They can differ in subject and teacher1-6.
- Every name/class must resolve unambiguously to Supabase Master Data or alias. Unrecognized short names block publish; do not guess whether ALIEF means TAUFAN.
- Preview generates A/B/A/B up to 8 weeks, recommended **2 weeks per batch** to avoid SQL/audit timeout. Uses existing atomic `ejadwal_publish_syaikh_rotation_v1`, meaning the importer **can overwrite existing SYAIKH_ROTATION entries**, but **refuses slots owned by other incidental types**.
- Room column not supported by this existing RPC; nonempty room generates warning. Rooms inherit master. Edit dated rooms separately in Jadwal Ruangan.
- Preview warns of teacher intersections. Supabase remains canonical validator. Admin must confirm warnings. No new recurring SQL job: dates are generated for a finite horizon. Schedule another batch next month.
- 'Native/Normal' original importer is unchanged.

## Example sheets

- `examples/syaikh-ali-example-A.tsv` uses the four supplied Oct 5 rows.
- `examples/syaikh-ali-example-B.tsv` is a paired scenario illustrating the rotation. **ALIEF is not assumed to be TAUFAN MUSTOFA**. Replace ALIEF with the true Master Guru name or create alias before publishing.
- Remaining 7/8 and 6/9 pairs require the actual weekday/JP master slot information, not provided in the conversation. Do not invent.

## Log actions

Desktop 'Log Izin & WA': action column sticky right with four 36px icon buttons (reminder, open WA if available, edit badal, soft-cancel) with aria-label/title and horizontal overflow. This retains Edit/Hapus reachability on narrow desktop widths. Mobile card actions preserved.

## Verification gates

- Targeted tests under `src/__tests__/v3-14-6-rc3-4-9-ali-ab-import.test.ts`.
- Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` on Windows.
- Test valid A/B 2 weeks in staging, verify master unchanged, check Supabase Conflict Center and Dashboard Teacher/Class.
- Test re-publish idempotence and reject overlapping unrelated incidental. Use staging and backup before production.

Extra ownership guard: if the existing slot is tagged `SYAIKH_ROTATION` but its reason does not identify the currently selected Syaikh, batch preview blocks it (so Ali cannot silently overwrite Manshur). This is a frontend guard; do not treat it as a substitute for server locking if simultaneous admins edit the same slots.

**Pekan parity:** If user-provided Oct 5 was truly scenario A, Oct 12 should begin scenario B. Domain warns `SCENARIO_PARITY_MISMATCH` instead of silently changing the admin-selected first scenario.
