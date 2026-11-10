# E-JADWAL V3.20 RC1.7.1 HF6.3 — Guest WhatsApp Badal Contact

## Masalah
Menu **Lengkapi Tugas** untuk guru izin menampilkan tombol **Hubungi Guru Badal**, tetapi kode mengambil nomor dari `teachers[].whatsapp_e164`. Pada snapshot Supabase publik, data guru memang disanitasi sehingga nomor di direktori tersebut kosong. Akibatnya tombol gagal di mode non-admin, walaupun nomor kontak penugasan badal sudah tersedia di `coverageSlots`.

## Perbaikan
- Tautan **Hubungi Guru Badal** kini membaca `whatsapp_guru_pengganti` dari data coverage untuk tanggal/JP/guru pengganti yang benar, bukan bergantung pada nomor dari direktori guru.
- Mode admin tetap punya fallback ke direktori apabila kontak coverage tidak ada.
- Template pesan dan `wa.me` tetap sama.
- Tidak mengubah akses edit, tidak menampilkan direktori nomor WA global, dan tidak menduplikasi tugas.
- Tombol **Minta Tugas via WhatsApp** di Dashboard Badal tidak berubah; fitur tersebut sebelumnya sudah menggunakan `whatsapp_guru_izin` dari record coverage.

## Catatan batasan
- Snapshot publik hanya menyediakan kontak untuk penugasan **hari ini atau mendatang**, belum termasuk tanggal lampau, sesuai kebijakan existing di `ejadwal_public_schedule_snapshot_v3`.
- Tombol untuk penugasan yang tidak punya kontak aktif tetap memberi pesan nomor tidak tersedia.
- Karena aplikasi bisa diakses tanpa login individual, kontak yang tersedia di snapshot publik dapat dijangkau pengunjung situs. Pastikan nomor yang dipakai adalah nomor kerja atau memang disetujui untuk koordinasi operasional.
- Tidak perlu migrasi Supabase. Kebutuhan data berasal dari RPC v3, yang sudah diwarisi RPC v4 pada HF6.2.

## File yang berubah
1. `src/components/LateTaskCompletion.tsx`
2. `src/__tests__/v3-12-5-dashboard-task-recovery.test.ts`

## Instalasi
- Jika sudah memakai HF6.2, ekstrak PATCH dari HF6.2 ke root proyek dan timpa file yang berubah.
- Jika belum, gunakan Full Source PERSONAL atau SHAREABLE HF6.3.
- Pastikan Supabase sebelumnya telah menjalankan migrasi HF6.2.
- Jalankan:

```bat
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

## UAT yang harus dilakukan di staging
1. Isi nomor WA pada Master Guru **guru pengganti**.
2. Buat pengajuan izin/badal aktif **hari ini atau tanggal mendatang** yang tugasnya belum diisi.
3. Matikan Admin Mode; pilih guru izin pada menu **Lengkapi Tugas**.
4. Klik **Hubungi Guru Badal**. Pastikan membuka percakapan WA ke nomor pengganti yang benar dan isi pesan sesuai tanggal, kelas, JP.
5. Uji kelas/JP lain agar kontak tidak tertukar.
6. Dari Dashboard Guru Badal, cek **Minta Tugas via WhatsApp** tetap membuka kontak guru izin yang benar.
7. Coba penugasan sudah berlalu / tanpa nomor: peringatan harus muncul, bukan mengarahkan ke nomor lain.
8. Setelah deploy, lakukan refresh Supabase dan hard refresh browser untuk memuat versi JavaScript terbaru.

## Verifikasi lingkungan pembuatan
- 9/9 tes untuk alur recovery tugas dan kontak lolos lewat Node.js type-stripping (dengan penyesuaian import sementara untuk runner tanpa dependency; source terdistribusi tidak diubah karena hal itu).
- Dua file yang berubah lolos pemeriksaan parser TypeScript.
- Full `npm ci`, `npm run lint`, `npm test`, dan `npm run build` belum bisa dilakukan karena dependency tidak tersedia secara offline di lingkungan pembuatan. Jangan perlakukan ini sebagai bukti production-ready.
