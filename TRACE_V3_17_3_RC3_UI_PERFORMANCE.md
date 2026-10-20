# E-JADWAL V3.17.3 RC3 — UI Performance Optimization

**Baseline:** V3.17.3 RC2.1 (Regression Test Fix). **Status:** release candidate untuk staging; belum production-stable.

## Perubahan

- `App.tsx` → `AdminLoginModal.tsx`: input email dan password punya state lokal. Mengetik tidak memicu render root App; autentikasi tetap Supabase, admin authorization dan fallback public snapshot tetap utuh.
- `Dashboard.tsx` → `DashboardTeacherSearch.tsx`: pencarian guru mandiri, berkomunikasi dengan dashboard hanya setelah nama guru dipilih/clear. Nama guru yang dipilih dari header tetap tersinkron.
- `IncidentalScheduleAdmin.tsx`: bangun jadwal efektif hanya ketika tanggal/data jadwal/editing berubah; ketikan subject, pilihan ruangan/guru, dan perubahan JP hanya menjalankan penilaian advisory konflik yang lebih murah. Validasi penyimpanan tetap di repository/DB seperti sebelum RC3.
- `SearchableSelect.tsx`: render input secara langsung; hasil opsi dapat di-defer tanpa mengizinkan Enter memilih opsi yang stale.
- `AdminMasterData.tsx`: input pencarian lokal; filter daftar master dikerjakan 130 ms setelah jeda, bukan tiap karakter; aksi CRUD tidak berubah.
- `EducationAudienceBuilder.tsx` dan `EducationCalendarAdmin.tsx`: memoization dengan callback stabil; perubahan judul/deskripsi event tidak memicu preview penerima dari awal.
- Tambahan 6 regression test RC3; penyesuaian metadata package version dan scripts saja. **Tidak ada dependency baru.**

## Yang tidak berubah

`supabase/migrations/`, seluruh SQL/RPC/RLS, source domain, data model, algoritma rekomendasi/izin/badal, jadwal master, logic penyimpanan, dan komponen jadwal kelas. **Tidak perlu menjalankan migrasi SQL baru.**

## Pengujian oleh pembuat paket

- 226 file TS/TSX lolos syntax transpile check (bukan TypeScript typecheck).
- 6/6 tes RC3 lolos memakai Node type-strip runner.
- 445/447 tes dijalankan dengan Node 22 + loader lokal: 445 PASS. Dua berkas tidak dapat dieksekusi karena `react`/`@supabase/supabase-js` tidak terpasang pada lingkungan audit; bukan dua assertion yang gagal.
- `npm ci --offline` gagal karena npm cache tidak lengkap; full `npm test`, TypeScript lint, production Vite build, React Profiler, serta browser/mobile smoke test **BELUM** lolos verifikasi. Harus diuji pada mesin dengan `node_modules` lengkap.
- Tidak ada benchmark milidetik atau klaim peningkatan kinerja yang terukur.

## Cara pemasangan

1. **Backup** source RC2.1 yang aktif, lalu gunakan cabang/staging.
2. Jika source lokal adalah **RC2.1**, ekstrak patch di root proyek, mengganti file yang sama. Kalau ragu baseline, pakai Full Source RC3.
3. Jika dependency `node_modules` sudah siap dan tidak ada perubahan dependency: langsung `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
4. Jika belum punya `node_modules`, jalankan `npm.cmd ci` terlebih dahulu (memerlukan network); atau `npm.cmd install` untuk pengembangan jika memang diperlukan.
5. Jalankan `npm.cmd run dev`. Di staging, uji login valid/gagal, dashboard pilih/clear guru, cari guru, input Jadwal Insidental (perubahan subject/teacher/room), SearchableSelect keyboard/mouse, Master Data pencarian + CRUD, Kalender Pendidikan + AND/OR + preview penerima.
6. Bandingkan input lag pada HP dan desktop sebelum dan sesudah; baru deploy setelah lint, semua tes, build, dan smoke test lolos.

## Catatan arsitektur

Semua form input yang terkait penyimpanan masih langsung memutakhirkan state yang digunakan saat Save. Hanya pencarian hasil daftar master yang memakai jeda 130 ms; input yang terlihat **tidak** di-debounce. Tidak ada pengunduran validasi sebelum submit.

Jika ada error saat test/lint/build, kirim **output lengkap error pertama**, jangan langsung pasang produksi.
