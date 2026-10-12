# V3.14.6 RC3.4.9.3 — Statistik Individu Guru + Shortcut WhatsApp Manajemen

## Basis

RC3.4.9.2 (bukti izin manajemen, Supabase-only guest, public dated WA, flexible Syaikh Ali).

## Fitur

- Menu ADMIN: Statistik Individu Guru (periode maks. 181 hari, sampai tanggal sekolah hari ini).
- JP mengajar mingguan dari jadwal master (JP1–6) dengan kelas gabung dideduplikasi per hari/JP.
- JP terjadwal per tanggal dihitung oleh `buildEffectiveScheduleForDate` dengan insidental dan kalender sekolah, dedup per tanggal/JP. Menggunakan snapshot master **saat ini**, bukan rekonstruksi historis yang dipastikan sama.
- JP izin berasal dari `APPROVED leave_request_periods` dan cakupan historis LEGACY_IMPORT / ADMIN_MANUAL yang aktif; dideduplikasi per tanggal/JP.
- JP0 dan JP Free masuk hitungan total izin secara terpisah, TIDAK masuk denominator persentase izin mengajar.
- Numerator rasio hanya JP izin yang cocok dengan jadwal terjadwal yang masih aktif; JP historis tak cocok ditandai tersendiri.
- Grafik heatmap Senin–Jumat x JP1–JP6 (jumlah dan rasio), tren izin menurut tanggal, rekap alasan sakit dari field alasan.
- Data izin sensitif hanya melalui RPC khusus petugas (`current_user_is_staff`), tidak melewati RPC publik.
- Shortcut WhatsApp +6281325245959 di dekat field bukti izin, link membuka tab baru. Bukti screenshot tetap wajib.
- Tidak ada penilaian otomatis yang menyimpulkan niat buruk, alasan sakit palsu, atau menentukan sanksi dari pola statistik.

## Perubahan Supabase

Jalankan setelah migration 006:
`supabase/migrations/202610120007_v3_14_6_individual_teacher_leave_analytics.sql`

RPC baru: `ejadwal_teacher_leave_profile_v1(p_teacher_id uuid, p_date_start date, p_date_end date)`. Authenticated + staff required; deny anon, no data pribadi pada guest RPC. Maksimum 181 hari, sampai hari ini Jakarta.

## QA

- Fokus domain 5/5 PASS lewat transpile CJS lokal.
- Parsing 188 file TypeScript/TSX, 0 error.
- Typecheck domain yang diubah PASS.
- `npm ci --offline` tidak berhasil karena @supabase/supabase-js tidak berada di npm cache. Karena itu full npm test, lint dan build masih perlu di laptop.
- Eksekusi SQL di Supabase staging **belum diuji**.

## Smoke Test Wajib

1. Jalankan migration pada staging; uji role ADMIN/WAKASEK vs anon/tamu.
2. Hitung JP guru yang memiliki kelas gabung di 1 JP: hanya 1 JP.
3. Bandingkan JP mengajar, JP Free, JP0 dengan satu izin yang sudah APPROVED dan satu legacy.
4. Periksa kegiatan akademik yang membatalkan sesi dan insidental yang mengubah kelas/guru.
5. Uji Alasan Sakit, sampel kecil dan rasio `0/0`.
6. Uji shortcut WA manajemen pada desktop/mobile; tidak menutup formulir.
7. Jalankan `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` sebelum Vercel.
