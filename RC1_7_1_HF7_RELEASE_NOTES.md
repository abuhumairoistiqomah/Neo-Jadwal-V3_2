# E-JADWAL V3.20 RC1.7.1 HF7 — Password Tugas & Soft Delete UX

Baseline: RC1.7.1 HF6.3. Status: **STAGING CANDIDATE**.

## Perubahan
1. **List Pengajuan Badal**: tiap pengajuan memiliki **Password Tugas** otomatis (12 huruf acak). ADMIN/WAKASEK yang login Supabase bisa melihat, mengubah (8–24 huruf A–Z), atau **Acak Ulang**. Perubahan diaudit tanpa mencatat password dalam log.
2. **Lengkapi Tugas**: guru memilih tugas/JP yang belum lengkap lalu memasukkan **satu Password Tugas** saja. Kode pengajuan dan 4 digit WA tidak lagi diperlukan pada alur ini. Backend memverifikasi password dan menerbitkan token upload 4 jam yang kompatibel dengan sinkronisasi tugas dan lampiran Drive yang sudah ada.
3. **Bypass admin terautentikasi**: ADMIN/WAKASEK dengan sesi Supabase sah dapat langsung membuka editor setelah memilih tugas; toggle *Admin Mode* UI saja tidak cukup untuk melewati pemeriksaan.
4. **Soft Delete** (juga Restore): klik tombol memindahkan viewport ke form konfirmasi di atas halaman. Penghapusan tetap memerlukan alasan dan konfirmasi.

## Keamanan dan batasan
- Password tersimpan dalam tabel **privat**, tidak dipublikasikan ke snapshot jadwal dan tidak dapat di-SELECT langsung oleh `anon` atau `authenticated`. Hanya RPC berotorisasi ADMIN/WAKASEK yang menampilkan/mengubahnya. Admin boleh membagikan password kepada guru terkait.
- Password dibuat server-side pada pengajuan baru, dan existing rows di-backfill saat migrasi. Pengajuan historis yang belum memiliki `request_code` diberi kode internal `TSK-<UUID>` agar jalur upload lama tetap kompatibel. Tidak ada password hardcoded di source atau `.env.local`.
- Token upload lama dicabut ketika password diubah/diacak ulang. Token baru berlaku selama 4 jam.
- Sepuluh kegagalan password dapat mengunci akses publik selama 10 menit. ADMIN/WAKASEK tetap bisa membuka lewat akun sah.
- Pengajuan yang statusnya tidak APPROVED, di-soft-delete, atau tanggal/JP-nya tidak cocok tidak dapat dibuka.
- Pengajuan ambigu (beberapa pengajuan pada guru/tanggal/JP yang sama) ditolak agar salah pengajuan tidak tertulis.
- `leave_task_passwords.password_text` sengaja dapat dilihat oleh admin dalam UI supaya dapat dibagikan ke guru. Jangan masukkan ke screenshot publik atau log; batasi akun admin dan akses backup database.
- Nomor WhatsApp dan tugas yang sudah ada tidak berubah. Tugas tetap satu sumber data dan sinkron ke badal.

## Instalasi staging (penting: SQL dahulu)
1. Backup Supabase staging.
2. Pastikan migrasi sampai HF6.2 sudah diterapkan.
3. Jalankan `supabase/migrations/202611110002_v3_20_rc1_7_1_hf7_task_passwords.sql` pada SQL editor Supabase staging.
4. Jalankan verifier `supabase/verifiers/202611110002_v3_20_rc1_7_1_hf7_readonly_verifier.sql`. Semua `ok` harus bernilai `true`.
5. Baru gunakan patch atau full source HF7 dan jalankan:

```bat
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

## UAT minimum
- Akun ADMIN/WAKASEK yang login: lihat password di List Pengajuan Badal, ubah/acak ulang, lalu pilih Lengkapi Tugas dan pastikan editor terbuka **tanpa password**.
- Admin Mode OFF dan tanpa login: pilih nama guru, tanggal/JP, masukkan Password Tugas. Pastikan upload teks/link/file berhasil dan isi langsung terbaca oleh guru badal.
- Password salah ditolak; password lama gagal setelah penggantian; pengajuan terhapus ditolak.
- Tekan Soft Delete pada pengajuan di bawah halaman. Viewport harus berpindah ke panel konfirmasi di atas.
- Uji sistem tugas dan badal lama untuk regresi.

## Verifikasi yang dilakukan
- 4/4 tes kontrak HF7 berhasil dengan Node built-in test runner.
- Semua 282 file TS/TSX/MTS lolos pemeriksaan parser TypeScript.
- **Belum lolos full tsc/build atau runtime PostgreSQL staging**: npm dependency tidak tersedia dan tidak dapat diunduh pada lingkungan ini. Paket jangan dinyatakan production-ready sebelum uji di laptop dan Supabase.
