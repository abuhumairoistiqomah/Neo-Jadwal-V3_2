# E-JADWAL V3.20 RC1.4 — Waiting List Approval: Edit Mapel

**Status:** staging candidate (belum production-verified)

## Highlight

RC1.4 memperluas kontrol **✎ Edit Mapel** dari Input Inval (Admin) ke proses **Persetujuan Izin → Waiting List → Tentukan Badal**. Admin/Wakasek dapat mengganti mata pelajaran aktual per tanggal + kelas + JP, misalnya Tahsin Syaikh → Tahsin/Al-Qur'an, tanpa mengubah jadwal master atau permohonan izin.

## Implementasi

- Nama mapel asli tetap tampil sebagai referensi; editor menyediakan input teks bebas dan saran mapel. Maksimal 120 karakter.
- Perubahan satu sesi gabungan diterapkan per kelas, berdasarkan ID coverage yang sudah ada.
- UI Waiting mengunci guru yang izin, tanggal, kelas, JP dan tugas asli; guru pengganti tetap ditentukan melalui rekomendasi pintar.
- RPC baru `ejadwal_assign_waiting_badal_v320_rc14(jsonb,text)` menyimpan seluruh assignment sesi dan perubahan mapel dalam satu transaksi DB; jika satu slot gagal, semua rollback.
- RPC menggunakan mekanisme penggantian guru eksisting sehingga validasi kendala HARD/SOFT dan audit tetap ada.
- `coverage_slots.subject_snapshot` dan `schedule_incidentals.override_subject` disinkronkan secara atomik bila mapel berubah; ruangan/jam/tim guru/catatan insidental lain tetap utuh.
- Validasi WAITING+APPROVED, tanggal tidak kedaluwarsa, kecocokan original subject, dan pengecekan jadwal efektif untuk menghindari stale save.
- Bila write berhasil tetapi UI gagal refresh, pesan tidak lagi keliru menyatakan rollback.

## Yang tidak berubah

- Penugasan Waiting tanpa edit mapel tetap berfungsi.
- Jadwal master, leave requests, learning tasks, dan data historis tidak dimodifikasi sebagai efek samping yang tidak diminta.
- Mode Aturan Guru Badal masih belum menyediakan editor mapel ini; JP0 Homeroom tetap tidak mengizinkan perubahan nama mapel melalui fitur ini.

## Install RC1.3 → RC1.4

1. Backup source dan Supabase staging.
2. Jalankan SQL `supabase/migrations/202610230003_v3_20_rc1_4_waiting_approved_subject_override.sql` di Supabase SQL Editor (setelah RC1.3 migration).
3. Jalankan `v320_RC1_4_READONLY_VERIFIER.sql`.
4. Ekstrak patch ke root source RC1.3, tanpa menimpa `.env.local` atau `package-lock.json`.
5. Jalankan `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`, `npm.cmd run dev`.
6. Uji pengajuan APPROVED yang WAITING, termasuk kelas gabungan dan mapel asli/baru; cek Log Izin & WA serta Jadwal Efektif tanggal itu, tidak mengubah tanggal lain.

## Pemeriksaan source pada saat packaging

- 263 TS/TSX source non-`.d.ts`: parsing/transpilasi berhasil.
- 25/25 tes domain V3.20 + Waiting List PASS.
- 40/40 tes regresi izin, inval, MQ, edit badal PASS.
- **Belum ada bukti** eksekusi migrasi PostgreSQL, full Vite build, atau TS full project lint berhasil di Supabase/laptop. Harus diuji sebelum production.

## Security & packaging

- Patch: 12 file ditambahkan/diubah, tanpa `.env.local` dan tanpa `package-lock.json`.
- Full Source PERSONAL: mengandung `.env.local` yang harus dirahasiakan.
- Full Source SHAREABLE: tidak mengandung `.env.local` atau `.env` privat, namun mencakup `.env.example` jika ada.
- Rollback source RC1.3 tidak otomatis menghapus override mapel yang sudah tersimpan; lakukan koreksi berdasarkan audit untuk rollback data.
