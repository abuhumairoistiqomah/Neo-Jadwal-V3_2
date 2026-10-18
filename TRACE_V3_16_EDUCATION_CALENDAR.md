# TRACE ON — E-JADWAL V3.16 RC1: Kalender Pendidikan

Baseline: **V3.15.5**. Release: **3.16.0-rc.1**.

## Ruang lingkup

- Menu publik **Kalender Pendidikan**, kalender bulanan + detail agenda saat tanggal diklik. Kegiatan multi-hari ditampilkan setiap hari dalam rentang tersebut.
- Menu khusus **ADMIN: Input Kalender Pendidikan**, dengan draft, publikasi, edit, cancel (tanpa menghapus riwayat), kategori, judul, rentang tanggal, deskripsi, dan tanggal otomatis WIB pada Dashboard.
- **Smart Audience Tag Builder**: kelas, mapel, peran pengampu/pendamping, keanggotaan tim, individu. Grup tag dapat memakai AND/OR, hubungan antarkelompok juga AND/OR. Lihat pratinjau kandidat penerima sebelum memublikasikan.
- Tag kelas seperti `06 INTER`, `09 AE`, `09 MQ`, `12 AE`, `12 MQ` mencakup semua kelas turunan bernama sama. Dalam AND, *kelas + mapel + peran* harus cocok pada satu penugasan master yang sama; guru Math di kelas 10 dan English di kelas 6 tidak keliru menerima event Math kelas 6.
- Tab **Tag Tim/Jabatan** untuk menetapkan keanggotaan organisasi seperti `WAKAKUR`, `MANAJEMEN`, `PANITIA FIELD TRIP`, `TIM TKA`. Pengubahan tag bukan peningkatan role login.
- Panel **Agenda 14 Hari Mendatang** di Dashboard, **collapsed by default**. Event publik dicocokkan dengan nama guru yang dipilih (ingat: itu bukan login). Event rahasia hanya ditargetkan berdasarkan `user_profiles.teacher_id` dari akun login.
- Checkbox **Khusus Manajemen — Full Confidential** menyembunyikan keseluruhan record (termasuk judul, deskripsi, metadata/jumlah) lewat policy Supabase RLS jika bukan akun ADMIN/WAKASEK yang sudah login. Tag tidak bisa mengangkat privilege pengguna publik.
- **Independen total** dari `academic_events`, Kalender Akademik, jadwal master, data insidental dan badal: event tidak mengubah sesi KBM.

## Install / upgrade

1. Backup database Supabase dan source V3.15.5 sebelum perubahan. Uji di proyek **staging** terlebih dahulu.
2. Jalankan migration **`supabase/migrations/202610170002_v3_16_education_calendar.sql`** di Supabase SQL Editor proyek staging menggunakan akun berizin.
3. Extract full source, atau apply patch **from V3.15.5** dengan menjaga struktur folder relatif.
4. Di Windows, dalam root proyek jalankan:
   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run lint
   npm.cmd run build
   npm.cmd run dev
   ```
5. Login Supabase ADMIN. Menu **Input Kalender Pendidikan**, buat draft event publik dan uji Publish; buka Kalender Pendidikan sebagai guest tanpa login, verifikasi judul dan detail.
6. Buat event `Khusus Manajemen`, target `WAKAKUR`. Pastikan guest sama sekali tidak mendapat detail/jumlah event rahasia, juga jika memilih nama anggota manajemen pada textbox. Login WAKASEK/ADMIN dan pastikan event terbaca; reminder hanya ada apabila akun telah dikaitkan dengan guru yang masuk tag WAKAKUR melalui `user_profiles.teacher_id`. Role WAKASEK tanpa guru terkait bisa melihat kalender event rahasia tetapi tidak menerima reminder bertarget (kecuali `Semua Manajemen`).
7. Uji rumus `(06 INTER OR 12 AE) AND Math AND Pengampu`, preview peserta lalu cek di Dashboard beberapa guru yang memenuhi/tidak memenuhi. Uji `CANCELLED` agar tidak menjadi reminder baru.
8. Lakukan smoke test jadwal guru, jadwal kelas, badal, persetujuan izin, dan Quick Edit sebelum deploy production.

## Penting: keamanan dan pengelolaan

- Policy `education_calendar_events` publik hanya untuk status `PUBLISHED`/`CANCELLED` dan `management_only = false`. ADMIN login membaca draft dan seluruh event. ADMIN/WAKASEK login membaca agenda manajemen terpublikasi/dibatalkan.
- Tabel `education_audience_memberships` **dibaca publik** untuk memungkinkan reminder publik dengan tag organisasi bagi guru yang belum login. Isinya hanya UUID guru dan kode tim. **Jangan tempatkan informasi rahasia sebagai kode tag organisasi**.
- Tag kelas/mapel berbasis jadwal **MASTER** (bukan penugasan badal mendadak). Resolver saat ini **dinamis**; perubahan master atau keanggotaan tim bisa mengubah penerima notifikasi untuk event yang sudah diterbitkan. Snapshot penerima dan pemberitahuan push/email belum diimplementasikan.
- **Role Supabase ADMIN/WAKASEK = kewenangan baca rahasia.** Checkbox `Khusus Manajemen` bukan bukti bahwa pilihan guru di textbox adalah orang tersebut.
- Jika akun staff belum dipetakan ke `user_profiles.teacher_id`, reminder yang menargetkan sub-tim tertentu tidak dapat ditentukan untuk akun tersebut. Kaitkan user dan guru sebagai ADMIN sebelum menguji notifikasi spesifik.
- Batas query saat ini 500 event per rentang dan 3000 keanggotaan tag. Wajar untuk agenda sekolah, tetapi saat melampaui batas harus ditambah pagination.
- Perubahan tag organisasi bersifat upsert/diff agar data lama tidak dihapus massal ketika menyunting satu checkbox.
- Batalkan event, bukan delete, untuk menjaga catatan kegiatan; status `CANCELLED` tetap dapat terlihat pada kalender, tetapi tidak menghasilkan reminder.

## Status validasi RC1

- Unit test V3.16: **9/9 PASS** melalui runner Node lokal dengan transpile TypeScript resmi.
- Parse TypeScript/TSX proyek: **208 file, 0 syntax errors**.
- Full `npm test`, `npm run lint`, dan `npm run build` **BELUM terverifikasi** di container ini karena dependency npm tidak ada dan npm registry tidak bisa diakses (EAI_AGAIN).
- Supabase live SQL migration, RLS role matrix, dan visual smoke test **BELUM dijalankan**. Jangan deploy RC1 ke production sebelum lulus uji tersebut.
