# E-JADWAL V3.20 RC1.7.1 HF7.1 — TypeScript Lint Hotfix

Baseline: **RC1.7.1 HF7**. Sasaran: memperbaiki 13 diagnostik TypeScript yang dilaporkan dari `npm.cmd run lint` tanpa mengubah aturan bisnis atau Supabase.

## Akar masalah dan perbaikan

1. **HF6.2 test fixture — 11 diagnostik:** `LogIzinItem` mensyaratkan `mapel`, tetapi objek `coverage` di `v3-20-rc1-7-1-hf6-2-inline-public-team-task.test.ts` tidak memilikinya. Tambahkan `mapel` dan beri `coverage` tipe `LogIzinItem` agar perubahan kontrak model berikutnya tertangkap saat lint. Tambahkan `isSuppressedByAcademicCalendar:false` pada objek slot uji agar tes yang mengubah flag tersebut tetap bertipe benar. Tambahkan assertion bahwa `subject` tetap ikut ke kartu.
2. **Dashboard.tsx — 1 diagnostik:** hasil fungsi `inlineTeamTasksForClassCard` kehilangan tipe `subject` melalui batasan generik yang terlalu lebar. Perjelas parameter dan keluaran helper menjadi `{coverage: LogIzinItem; subject: string}[]`, sesuai kontrak `collectTeacherDashboardTeamTaskNotices` yang memang menghasilkan `subject`.
3. **SupabaseApprovedLeaveMaintenanceRepository — 1 diagnostik:** `Map` dari data RPC tak bertipe menyebabkan `taskPassword` terinfer sebagai `unknown`. Tetapkan `Map<string,string>` dengan tuple eksplisit `[string,string]` setelah mengonversi nilai RPC menjadi string.

## Berkas yang diubah

- `src/__tests__/v3-20-rc1-7-1-hf6-2-inline-public-team-task.test.ts`
- `src/domain/schedule/teamTeachingTask.ts`
- `src/infrastructure/repositories/supabaseApprovedLeaveMaintenanceRepository.ts`

**Tidak ada perubahan** pada SQL, fungsi Supabase, hak akses, tugas guru, formula analytics, `.env.local`, atau `package-lock.json`.

## Hasil pengujian di lingkungan pembuat

- **25/25 tes fokus** HF5, HF6, HF6.2, HF7 lolos menggunakan Node 22 `--experimental-strip-types` (tes yang dapat dieksekusi tanpa dependency eksternal).
- **Typecheck terisolasi strict** untuk `teamTeachingTask.ts` dan test fixture HF6.2 lolos dengan TypeScript 5.8.3; hanya deklarasi `node:*` pengganti temporer dipakai di luar source proyek.
- **Full `tsc --noEmit` belum terverifikasi**: paket npm belum tersedia, `npm ci --offline` gagal ENOTCACHED, dan registry online gagal EAI_AGAIN. Jangan mengartikan hasil parse/transpile sebagai lolos lint proyek penuh.
- Tidak ada SQL migration baru atau uji Supabase yang diperlukan untuk ketiga perbaikan tipe ini.

## Instalasi

Jika sudah menggunakan **HF7**, cadangkan folder proyek dan ekstrak **PATCH HF7 → HF7.1** ke root `e-jadwal-v3.20` (folder yang berisi `package.json`), lalu izinkan overwrite. Atau gunakan Full Source PERSONAL HF7.1 untuk mempertahankan `.env.local` dari baseline PERSONAL HF7.

Di CMD Windows Snapdragon:

```bat
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

Jika `node_modules` belum ada, jalankan `npm.cmd ci` lebih dulu.

**Staging candidate.** Validasi lint penuh, tes, build, kemudian UAT sebelum push ke Vercel production. Bila masih ada error, kirim output lengkapnya sebelum deploy.
