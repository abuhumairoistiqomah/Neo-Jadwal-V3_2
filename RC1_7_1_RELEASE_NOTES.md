# E-JADWAL V3.20 RC1.7.1 — Inline Task & Room Calendar Hotfix
Tanggal paket: 30 Oktober 2026 | Status: STAGING CANDIDATE (belum production verified)

## Dua koreksi terhadap RC1.7

1. **Edit Tugas oleh Admin dari modal Penempatan Inval Rekomendasi Pintar**
   - Kolom tugas untuk pengajuan izin APPROVED sekarang benar-benar bisa diketik admin/WAKASEK.
   - Tombol **Simpan Perubahan Tugas (Audit)** langsung menulis ke `leave_request_tasks` via RPC `ejadwal_edit_leave_task_rc17` (sudah disediakan SQL RC1.7); audit dan trigger sinkronisasi `learning_tasks`/coverage tetap dipakai.
   - Pengajuan tugas JP harus disimpan terlebih dahulu sebelum 'Simpan Badal Pengajuan Izin' jika ada perubahan. Tidak diam-diam mengubah hanya salinan lokal.
   - Optimistic concurrency: server menolak teks `p_expected_description` yang sudah berubah; refresh jika ditolak.
   - Link/lampiran task resources yang sudah tercatat dipertahankan. **Pergantian lampiran bukan cakupan hotfix ini**.
2. **Reservasi event langsung pada `Jadwal Ruangan`**, bukan sebagai menu sidebar baru.
   - Login Supabase ADMIN/WAKASEK, buka Jadwal Ruangan, pilih ruang dan minggu, aktifkan **Edit Ruangan Minggu Ini**, klik slot JP, pilih tab **Reservasi Event**.
   - Isi nama kegiatan, PIC, waktu, keterangan; **tanpa kolom kelas pengguna maupun guru pengampu**. Ini record `room_event_reservations` tersendiri, bukan sesi pelajaran fiktif.
   - Cek bentrok (preview), Simpan (cek atomik di RPC), Edit/Batalkan (audit); event muncul sebagai pemakaian ruang pada grid mingguan dan daftar event di bawah kalender, termasuk event di luar JP.
   - Guru/guest dapat melihat judul dan jam pemakaian melalui RPC *public minimal*; PIC, rincian, histori dan kemampuan edit hanya untuk staf yang berhak.
   - Keterlambatan loading/SQL belum terpasang ditampilkan sebagai error, bukan dinyatakan 'kosong'.
   - Jam fallback kalender diseragamkan dengan `JAM_TIME_MAP` dan fallback pemeriksaan Supabase (JP1 07:30-08:15 dsb.). Jadwal dengan custom start/end tetap mengikuti jam record di pemeriksaan backend.

## Migrasi / Instalasi

**JANGAN langsung production.** Backup DB dan source dahulu.
- Bila RC1.7 sudah dipasang di staging: jalankan hanya `supabase/migrations/202610300003_v3_20_rc1_7_1_room_calendar_integrated.sql` di SQL Editor Supabase, kemudian jalankan `supabase/verifiers/202610300004_v3_20_rc1_7_1_readonly_verifier.sql`.
- Bila mulai dari RC1.6.1: terapkan SQL RC1.7 migration `202610300001_...leave_task_inval.sql`, `202610300002_...room_event_reservations.sql` dan baru `202610300003_...room_calendar_integrated.sql` BERURUTAN, lalu source Full RC1.7.1.
- Patch ZIP ditujukan untuk source RC1.7 SHAREABLE yang belum dimodifikasi. Ekstrak menimpa file sesuai jalur `e-jadwal-v3.20/`. Hapus file legacy `src/components/RoomEventReservationsRC17.tsx` jika masih ada; komponen itu **tidak dipakai** sejak reservasi digabung dalam kalender.
- `.env.local` tidak ada di paket SHAREABLE. Gunakan kembali konfigurasi lokal pribadi yang sudah ada, tanpa membagikannya.

## Pengujian lokal Windows
```
npm.cmd ci
npm.cmd run lint
npm.cmd run test:320
npm.cmd run build
```
UAT staging:
1. Masuk sebagai ADMIN Supabase. Buka Persetujuan Izin → pilih waiting badal; generate; edit teks tugas; klik Simpan Perubahan Tugas; cek pesan sukses; simpan assignment; buka tugas pengganti dan pastikan isinya terbaru; periksa audit.
2. Coba edit teks tanpa menyimpan lalu langsung Simpan Badal → harus ditolak.
3. Dua admin mengubah teks JP sama: edit dari snapshot lama harus ditolak `TASK_STALE_REFRESH_REQUIRED`.
4. Jadwal Ruangan → aktifkan mode Edit, klik slot kosong → Reservasi Event → isi nama, PIC, waktu; simpan → event muncul. Uji bentrok terhadap jadwal aktif dan dua event overlap → harus ditolak.
5. Edit dan batalkan event dari kalender; periksa audit; cek list public guru tanpa mengungkap PIC/description.
6. Uji event setelah JP reguler → tetap muncul di daftar event mingguan. Cek bahwa jadwal master tidak berubah.

## Validasi yang benar-benar dilakukan
- 7 kontrak statis (RC1.7 dan RC1.7.1) lolos menggunakan `node --experimental-strip-types --test ...`.
- 278 file TypeScript/TSX lolos parsing TypeScript global.
- **Belum** menjalankan `npm ci`/full build lint, tes integrasi browser, atau migrasi PostgreSQL sungguhan. Status **STAGING CANDIDATE**. Jalankan UAT sebelum deploy production.

## Catatan keselamatan data
- Core RC1.7 (koreksi alasan izin + audit; klasifikasi Input Inval) tidak diganti.
- Frontend tidak mengubah jadwal master, tidak membuat kelas fiktif untuk event.
- SQL baru bersifat additive (hanya RPC calendar readonly); event lama tak dihapus.
- Pengubahan jadwal pelajaran oleh modul lain setelah event dibooking **belum** dikunci oleh reservasi; audit ulang ruang diperlukan. Konflik dicek ketika event dibuat/diedit, tetapi mutasi master/insidental sesudahnya masih dapat menabrak event.
