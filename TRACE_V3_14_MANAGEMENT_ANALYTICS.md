# TRACE V3.14 — Management Analytics

## Goal

Mengubah data operasional E-Jadwal yang sudah canonical menjadi dashboard manajemen yang bisa menjawab bukan hanya “siapa izin/badal hari ini”, tetapi pola beban, coverage, task readiness, dan status workflow dalam rentang waktu tertentu.

## Architecture

```text
leave_requests + leave_request_periods
coverage_slots + learning_tasks
leave_request_tasks + resources
schedule_master + teacher assignments
                 │
                 ▼
ejadwal_management_analytics_v1(start,end)
                 │
                 ▼
        Management Analytics UI
```

Tidak ada tabel statistik/materialized copy baru. Analytics adalah read model dari data canonical.

## Attendance semantics

`APPROVED leave_request_periods` adalah attendance fact utama:

- TEACHING = guru tidak hadir pada JP yang memang mengajar;
- FREE = guru tidak hadir di sekolah meski tidak mengajar;
- JP0 TEACHING = Homeroom duty yang wajib badal.

DECLINED/CANCELLED tidak dimasukkan sebagai absence fact.

Untuk histori sebelum workflow leave modern, active `coverage_slots` legacy/admin-manual ditambahkan sebagai teaching-absence unit agar kontribusi badal historis tidak hilang.

## Combined-session deduplication

Canonical DB dapat mempunyai beberapa coverage row untuk satu sesi gabung. Management Analytics mengelompokkan coverage berdasarkan absent teacher + date + JP (+ request/source identity) sebelum menghitung coverage rate.

Contoh:

```text
05 INTER 1 + 05 MQ IKHWAN
Guru izin A • 14/10 • JP3
2 coverage rows di DB
→ 1 operational teaching unit di Analytics
```

Substitute load juga dideduplikasi per substitute + absent teacher + date + JP.

## Coverage KPI

`coverage_needed_periods` = seluruh teaching-absence units, termasuk JP0.

`coverage_assigned_periods` = operational units yang canonical coverage rows-nya sudah ASSIGNED/COMPLETED dengan guru badal.

FREE tidak pernah menjadi denominator coverage.

Coverage health label:

- >=95% = BAIK
- >=80% = PERLU PERHATIAN
- <80% = KRITIS

## Task readiness

Task denominator hanya TEACHING JP1–JP6. JP0 Homeroom sengaja dikeluarkan.

Task dianggap siap jika teacher-owned `leave_request_tasks` memiliki text/resource, atau coverage sudah memiliki `learning_tasks` text/resource. Ini menjaga histori lama dan late-task recovery tetap terbaca.

## Teacher workload

Per guru ditampilkan:

- JP reguler mingguan: distinct day + JP dari active `schedule_master`;
- hari ketidakhadiran;
- total JP absent, teaching, FREE, JP0;
- JP menjadi badal pada rentang analisis;
- task readiness ketika guru tersebut izin.

JP reguler kelas gabung tidak digandakan karena dihitung distinct day + period per teacher.

## UI filters

Preset:

- Bulan Ini
- 30 Hari
- 90 Hari
- Custom

Custom RPC range dibatasi maksimum 730 hari di server untuk mencegah query analytics tak terbatas dari browser.

## CSV export

Export hanya mengeluarkan tabel guru yang saat itu tampil setelah search/filter. File dibuat di browser, tidak menulis data baru ke Supabase.

## Security

`ejadwal_management_analytics_v1`:

- SECURITY DEFINER;
- explicit `STAFF_REQUIRED`;
- EXECUTE untuk authenticated;
- anon/public revoked.

## Migration

- `044` — Management Analytics RPC.
- `045` — verifier, target **10/10 TRUE**.

## Smoke test

1. Jalankan `044`, lalu `045`; target 10/10 true.
2. Login ADMIN/WAKASEK dan buka **Management Analytics**.
3. Rentang Bulan Ini harus load tanpa membuka Apps Script.
4. Buat/cek satu izin APPROVED yang punya TEACHING + FREE: kedua angka berubah, tetapi coverage denominator hanya TEACHING.
5. JP0 approved: Homeroom KPI +1 dan coverage needed +1; task denominator tidak berubah.
6. Assign badal pada combined class: coverage assigned naik satu JP, bukan sejumlah canonical row.
7. Lengkapi tugas: task readiness berubah setelah Refresh.
8. Cari guru di tabel dan Export CSV; CSV hanya mengikuti row yang sedang difilter.
9. `npm test`, `npm run lint`, `npm run build` harus lolos sebelum production.
