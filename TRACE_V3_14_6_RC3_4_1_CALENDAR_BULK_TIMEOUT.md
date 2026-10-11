# V3.14.6 RC3.4.1 — Kalender Akademik Bulk Timeout

## Diagnosis (source-audited, staging validation required)

Error `57014 canceling statement due to statement timeout` saat menyimpan banyak kelas bukan error nama kelas. Setiap row `academic_events` pada RC3.4 memicu audit + pembuatan full `schedule_versions` snapshot. Karena satu `insert(payload)` memuat semua kelas, snapshot dihitung ulang per baris, yang berpotensi memakan waktu jauh lebih lama daripada satu kelas per jenjang. Ini sangat mungkin menyebabkan timeout; konfirmasi definitif butuh database query logs/EXPLAIN di Supabase.

## Patch

- `ejadwal_save_academic_event_group_v2`: RPC transaksional untuk semua target kelas. Auditing per row dipertahankan, tetapi versi jadwal hanya diambil sekali setelah semua insert dan inaktivasi revisi selesai. Semua gagal -> rollback otomatis.
- `ejadwal_set_academic_event_group_active_v2`: versi batch untuk toggle ACTIVE/INACTIVE.
- Frontend memanggil RPC, menampilkan panduan migration jika RPC belum ada; tidak mengandalkan fallback batch lama yang rawan timeout.
- History mencantumkan `ACADEMIC_EVENT_GROUP_PUBLISH` / `ACADEMIC_EVENT_GROUP_STATUS`.

## Instalasi (staging dulu)

1. Backup atau snapshot database staging. Pastikan migration RC1–RC3.4 (`001`–`004`) sudah terpasang.
2. Jalankan `supabase/migrations/202610110052_v3_14_6_calendar_bulk_versioning.sql` via Supabase SQL Editor **staging**, bukan production.
3. Terapkan source RC3.4.1 pada branch staging, lalu `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
4. Uji kegiatan untuk kelas sedikit, banyak kelas, edit event lama, toggle, dan rollback version; cek satu `schedule_versions` per RPC dan audit per kelas.
5. Pastikan transaksi gagal tidak meninggalkan baris parsial. Setelah lolos di staging, baru jalankan migration dan frontend production.

## Batasan

Tidak ada koneksi Supabase live pada lingkungan authoring; PostgreSQL RPC belum dieksekusi terhadap database sebenarnya. Test yang lolos memeriksa struktur dan logika sumber; keberhasilan SQL migration masih harus diuji di staging.
