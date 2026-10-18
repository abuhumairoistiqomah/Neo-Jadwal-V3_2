# E-JADWAL V3.16.3 RC1 — UX Sidebar + Reminder

**Baseline:** V3.16.2 RC1. Patch ini frontend-only, **tidak membutuhkan migrasi SQL** tambahan.

## Perubahan

1. Pada Dashboard, tombol **Sembunyikan** tersedia di bagian bawah kanan detail Agenda 14 Hari, sejajar dengan **Lihat Kalender Pendidikan**. Tombol ini menutup rincian, tanpa mengubah data/reminder, dan panel tetap tertutup secara default.
2. Menu guru diurutkan menjadi **Dashboard**, **Jadwal** (Jadwal Pribadi, Jadwal Kelas, Jadwal Ruangan, Kalender Pendidikan), **Perizinan** (Ajukan Izin, Lengkapi Tugas), dan **Statistik** (Guru per Kelas, List Mapel Diajar, Jam Kosong Indiv).
3. Menu Admin dibagi menjadi **Administrasi**, **Kelola Jadwal & Kalender**, **Analitik & Rekap**, dan **Data & Impor**.
4. Semua `ActivePage` ID, `adminOnly`, callback navigasi, dan rute login tetap. Desktop/collapsed/mobile menggunakan metadata kategori yang sama. `Jadwal Lengkap` hanya diganti *label menu*-nya menjadi **Jadwal Pribadi**.

## Install

1. Pastikan source saat ini **V3.16.2 RC1**. Backup terlebih dahulu.
2. Extract isi ZIP patch ke **root** proyek, dengan replace/overwrite. Jangan membuat nested folder `src/src`.
3. Jalankan di Windows:

   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run lint
   npm.cmd run build
   npm.cmd run dev
   ```

4. Smoke test manual: buka panel agenda yang berisi beberapa event, scroll sampai bawah, klik **Sembunyikan**. Pastikan panel tertutup; buka lagi dari header. Cek seluruh kategori sidebar di desktop, mobile, dan collapsed; buka halaman lama termasuk menu Admin. Verifikasi hanya label menu Jadwal Pribadi yang berubah.

**Jika masih menggunakan V3.16 atau V3.16.1:** jangan aplikasikan patch ini langsung. Gunakan full source V3.16.3 dan jalankan migrasi **V3.16.2 soft delete** terlebih dahulu jika belum terpasang. Migrasi V3.16 tetap diperlukan dari baseline sebelumnya.

## Verifikasi lokal penyusun paket

- 9/9 regression test terkait (termasuk pengujian lama V3.14.1 dan V3.16.3 baru): PASS.
- Pemeriksaan sintaks seluruh 211 TypeScript/TSX: PASS.
- Full `npm test`, `lint`, `build`, tes browser, dan tes integrasi Supabase **belum terverifikasi** di lingkungan penyusun paket (dependency proyek tidak tersedia secara lokal).
