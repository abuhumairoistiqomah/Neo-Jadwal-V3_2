# E-JADWAL V3.20 RC1.4.1 — TypeScript Hotfix

## Masalah
`npm.cmd run lint` melaporkan TS2339 pada `src/components/InputGuruPengganti.tsx:2128` karena TypeScript menginferensi elemen hasil `Set` sebagai `unknown`; `.localeCompare` hanya berlaku pada string.

## Perbaikan
Mengubah `new Set(...)` menjadi `new Set<string>(...)` dalam datalist saran nama mapel.

## Cara memasang
Ekstrak ZIP patch **di folder proyek** (folder yang berisi `package.json`) dengan opsi menimpa file `src/components/InputGuruPengganti.tsx`.

Jalankan:

```powershell
npm.cmd run lint
npm.cmd run build
```

Tidak ada migrasi Supabase baru atau perubahan dependency. Nomor versi pada `package.json` tetap `3.20.0-rc.1.4` karena ini patch source satu-file; nama patch `RC1.4.1` untuk pelacakan.

## Lingkup validasi
Source diperiksa dan sintaks TSX ditranspilasi tanpa error; pemeriksaan TypeScript lengkap di proyek perlu dijalankan pada lingkungan dengan seluruh dependency terpasang.
