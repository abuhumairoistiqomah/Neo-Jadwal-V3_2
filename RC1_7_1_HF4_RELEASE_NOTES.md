# E-Jadwal V3.20 RC1.7.1 HF4 — Jadwal Kelas Incidental Color Parity

Tanggal: 2 November 2026  
Baseline: RC1.7.1 HF3  
Jenis rilis: hotfix antarmuka (tanpa migrasi database)

## Masalah
HF3 sudah mengubah status `INSIDENTAL` di **Jadwal Guru** menjadi orange, tetapi **Jadwal Kelas** memiliki renderer dan palet sendiri yang masih indigo. Akibatnya, contoh Bimbingan Karir oleh Firana dan Tahsin Syaikh dapat berwarna ungu/biru muda dalam Jadwal Kelas walau insidental tampak orange di Jadwal Guru.

## Perbaikan HF4
- Jadwal Kelas (mode **Jadwal Insidental / Minggu Ini**): sel insidental desktop dan mobile menjadi **orange** (`bg-orange-50`, `border-orange-500`, `text-orange-950`).
- Label guru dan badge JP pada sel insidental mengikuti aksen orange.
- Legenda `Jadwal Insidental` pada Jadwal Kelas disamakan menjadi orange.
- Status `BADAL`/`Badal belum ditentukan` tetap menang terhadap warna insidental (menjaga prioritas operasional sebelumnya).
- Status insidental kini mengungguli label kelas bergantian *untuk visual*, bila keduanya terjadi pada slot efektif yang sama. Data kelas bergantian tidak diubah.
- Layout Senin–Kamis dan Jumat menggunakan object `visual.desktop` yang sama; mobile memakai `visual.mobile`; PNG mengekspor area tabel aktual, sehingga warna baru ikut pada ekspor bila berhasil di-render di browser.
- Mode **Jadwal Normal / MASTER** tetap menampilkan jadwal master tanpa warna perubahan bertanggal.

## File yang diubah
- `src/components/JadwalKelas.tsx`
- `src/__tests__/jadwal-kelas-visual.test.ts` (regresi desktop, mobile, legend, prioritas warna)
- `package.json` (`test:320` sekarang mencakup suite visual kelas)
- `RC1_7_1_HF4_RELEASE_NOTES.md` (dokumen ini)

## Pemasangan
Jika source saat ini **RC1.7.1 HF3**, salin isi `e-jadwal-v3.20-RC1.7.1-HF4-PATCH-from-HF3.zip` ke root proyek (folder yang berisi `package.json`), lalu jalankan:

```cmd
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

Pada device baru yang belum memiliki dependency, jalankan `npm.cmd ci` **sebelum** empat perintah di atas. Paket PERSONAL sudah berisi `.env.local`; simpan privat dan jangan dibagikan.

## UAT browser
1. Buka Jadwal Kelas → pilih kelas `12 AE 2 I` (atau kelas dengan data Bimbingan Karir Firana) → mode Minggu Ini pada 2–6 Nov 2026.
2. Pastikan sel `Bimbingan Karir` Selasa JP3 / jadwal insidental lain berwarna orange dan label `INSIDENTAL` tetap terlihat.
3. Periksa Jumat/sel lain yang insidental bila tersedia, tampilan mobile, dan PNG export.
4. Bandingkan dengan Jadwal Guru Firana pada tanggal yang sama; warna insidental harus konsisten.
5. Pindah ke Jadwal Normal: sel master tetap warna reguler dan jadwal master tidak berubah.
6. Slot badal tetap memakai warna kuning/amber, bukan dipaksa menjadi orange.

## Pengujian dan batas validasi
- 277 file TS/TSX non-deklarasi lolos transpile/parsing sintaks.
- 14/14 pemeriksaan kode terarah (warna desktop/mobile, legenda, mode, ekspor, prioritas, script test) lolos.
- Tidak bisa menjalankan lint / full npm test / test:320 / Vite build di lingkungan pembuatan karena `npm ci` gagal mengakses registry npm (`EAI_AGAIN`). Lakukan semua pengujian di perangkat lokal sebelum deploy.
- Tidak ada SQL migration atau perubahan data Supabase.
