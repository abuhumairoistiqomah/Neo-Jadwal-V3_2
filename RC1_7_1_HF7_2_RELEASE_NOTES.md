# E-JADWAL V3.20 RC1.7.1 HF7.2 — Ringkas Notifikasi Tugas Teaching Team

**Baseline:** RC1.7.1 HF7.1. **Lingkup:** UX frontend Dashboard Guru, tanpa perubahan data maupun Supabase.

## Mengapa
Satu kartu pelajaran gabungan pada Dashboard Guru menampilkan kartu-kartu hijau berulang untuk setiap pengajuan badal. Contoh: tiga kelas MQ dan dua guru izin per kelas = enam kartu tugas pada satu JP. Konten menjadi terlalu panjang.

## HF7.2
- Ringkas seluruh notifikasi **di kartu JP yang sama** menjadi satu bar `Tugas Teaching Team • N kelas • M informasi`.
- Bar secara default **tertutup**. Klik/Enter pada bar untuk membuka daftar detail.
- Dalam detail, informasi dibagi berdasarkan **kelas** (03/04/05 MQ) dengan setiap pengajuan guru izin tetap tampak dan **tombol Lihat Tugas** tetap membuka tugas aslinya.
- Filter tanggal, JP, kelas, status izin/penugasan, serta keputusan no-subsitute lama tidak berubah. Pengulangan coverage ID yang sama dieliminasi pada tampilan.
- Tidak menambah sidebar, halaman, dashboard section, record tugas atau penugasan badal baru.

## File berubah
- `src/components/Dashboard.tsx`
- `src/domain/schedule/teamTeachingTask.ts`
- `src/__tests__/v3-20-rc1-7-1-hf7-2-team-task-grouping.test.ts` (baru)
- `package.json` (memasukkan tes HF7.2 ke `npm test` dan `npm run test:320`)

## Tes yang dijalankan di lingkungan pengemasan
- Tes fokus HF5/HF6/HF6.2/HF7.2: seluruhnya lolos.
- Tes Team Teaching lama dan HF7: seluruhnya lolos pada pengujian fokus.
- Helper pengelompokan lolos `tsc --noEmit --strict` terisolasi.
- File TS/TSX yang diubah lolos parser TypeScript.
- **Full `npm run lint`, `npm test`, `npm run test:320`, `npm run build` belum bisa dijalankan di sini** karena dependency npm proyek tidak tersedia. Wajib verifikasi pada laptop sebelum deployment.

## Instalasi
1. Jika sudah menggunakan HF7.1, ekstrak paket PATCH HF7.2 ke **root proyek** (folder yang memiliki `package.json`), timpa file bila diminta.
2. Jika memilih Full Source, gunakan PERSONAL hanya di perangkat pribadi. SHAREABLE tidak membawa `.env.local`.
3. Tidak ada SQL migration baru dan jangan mengulang SQL HF7 hanya untuk hotfix ini.
4. Jalankan:

```bat
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

5. UAT: Admin Mode OFF, pilih Wanda pada hari/JP dengan tiga kelas MQ gabungan. Pastikan hanya ada satu bar ringkas; buka, periksa 03/04/05 MQ serta dua pengajuan masing-masing. Klik masing-masing Lihat Tugas dan pastikan teks tugas yang dibuka tepat. Coba guru lain dengan satu tugas dan guru tanpa tugas.

**Status:** Staging candidate. Tidak ada perubahan data, hak akses, atau credential.
