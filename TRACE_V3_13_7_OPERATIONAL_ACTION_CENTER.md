# TRACE V3.13.7 — Operational Action Center

## Goal

Memberi Wakasek/Admin satu operational inbox untuk pekerjaan yang membutuhkan tindakan sekarang, tanpa membuat sumber data baru atau menduplikasi workflow existing.

## Data sources

Action Center adalah projection/read model di frontend atas sumber canonical yang sudah ada:

| Action | Source |
|---|---|
| Pending Approval | `leave_requests` melalui `SupabaseLeaveApprovalRepository.listSubmittedRequests()` |
| Waiting Badal | `coverage_slots` melalui `listWaitingCoverage()` + `groupWaitingBadalRows()` |
| Missing Task | canonical `logs` Supabase snapshot, dikelompokkan per date/JP/absent/substitute/subject |
| Conflict Alerts | `detectScheduleConflicts(master, incidentals, academic calendar)` |

Tidak dibuat tabel antrean baru. Ini mencegah Action Center menjadi sumber kebenaran kedua.

## Actionable boundary

- Waiting List: repository memanggil `ejadwal_expire_stale_waiting_coverage` lalu hanya mengambil `schedule_date >= schoolToday`.
- Missing Task: `isTaskRecoveryDateActive()` -> current/future only.
- Incidental conflict: tanggal lampau difilter dari Action Center.
- Master/recurring conflict: tetap tampil karena masih akan berulang.

Histori tidak dihapus.

## Summary semantics

`totalActionCount` = pending approval + grouped waiting-badal session + grouped missing-task session + actionable conflict.

`urgentTodayCount` = approval yang tanggalnya sudah terlewat + waiting badal hari ini + missing task hari ini + seluruh blocker conflict.

Blocker conflict sengaja selalu dihitung urgent karena merupakan integritas jadwal, walaupun recurring conflict memakai nama hari bukan tanggal konkret.

## Deep links

- Approval / waiting -> `approval-izin`.
- Missing task -> set selected teacher -> `lengkapi-tugas`.
- Conflict -> `schedule-control-center`.

## Refresh behavior

- load saat mount;
- manual Refresh;
- polling 60 detik;
- tanggal sekolah tetap berasal dari App `schoolToday` Asia/Jakarta yang rollover tiap 60 detik.

## Regression repair

V3.13.6 mengubah schedule editor state dari primitive list menjadi object `{ items, initialDate? }`. Test V3.13.5 masih mengharapkan `setScheduleEditorItems(items)`. V3.13.7 memperbaiki assertion menjadi `setScheduleEditorState({ items })`.

## No database migration

V3.13.7 hanya menambahkan projection/action UI dan pure domain aggregation. Tidak ada schema/RPC baru. Database V3.13.6 tetap canonical.

## Smoke test

1. Buat/biarkan satu leave `SUBMITTED` -> Action Center Pending Approval +1.
2. Approve request ber-JP TEACHING -> Pending turun, Waiting Badal naik.
3. Assign badal tanpa tugas -> Waiting turun setelah assignment; Missing Task muncul.
4. Lengkapi tugas -> Missing Task hilang setelah snapshot refresh.
5. Buat teacher/room conflict -> Conflict Alerts muncul; inferred combined session tidak boleh menjadi false positive.
6. Past incidental conflict tidak tampil di Action Center.
7. Klik tiap row -> pindah ke workflow terkait.
8. `npm test` memastikan test V3.13.5 stale sudah ikut diperbaiki.
