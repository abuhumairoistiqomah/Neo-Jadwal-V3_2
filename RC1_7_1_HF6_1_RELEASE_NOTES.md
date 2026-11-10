# E-Jadwal V3.20 RC1.7.1 HF6.1 — Full TypeScript Lint Hotfix

**Basis:** RC1.7.1 HF6. **Tujuan:** memperbaiki dua error `tsc --noEmit` yang dilaporkan ketika lint di Windows Snapdragon.

## Perbaikan

1. `src/__tests__/v3-20-rc1-7-1-hf6-teacher-dashboard-tasks.test.ts`
   - Tambahkan properti wajib `alasan` ke fixture `LogIzinItem`.
   - Perbarui assertion source agar menguji pemanggilan helper dengan tipe generik eksplisit.
2. `src/components/Dashboard.tsx`
   - Ubah pemanggilan menjadi `collectTeacherDashboardTeamTaskNotices<DashboardEffectiveItem>(...)`.
   - Tipe callback `canShowSlot` kini menerima `DashboardEffectiveItem`, yang sesuai dengan `EffectiveScheduleItem` yang diwajibkan `resolveDisplacedTeacher`.
   - Tidak menggunakan `as any` atau mengubah filter status, identitas kelas, JP, dan logika badal.

## Status pengujian
- Tes fokus HF6, HF5, dan Team Teaching lama: **23/23 lolos** dengan Node.js experimental type stripping.
- Dua file perubahan diperiksa secara statis; tidak ada perubahan schema / migrasi SQL.
- **Full `npm run lint`, `npm test`, `npm run test:320`, `npm run build` belum dapat dijalankan di environment penyusunan paket** karena dependency proyek tidak tersedia dan akses registry npm gagal (`EAI_AGAIN`). Jalankan di laptop sebelum deploy production.

## Instalasi
- Untuk source HF6 yang sudah ada: ekstrak PATCH HF6 → HF6.1 dari akar proyek (`e-jadwal-v3.20`, satu folder dengan `package.json`).
- Alternatif: gunakan PERSONAL HF6.1 dengan `.env.local` lama yang dipertahankan, atau SHAREABLE tanpa `.env.local`.
- **Tidak memerlukan SQL.**

```bat
npm.cmd run lint
npm.cmd test
npm.cmd run test:320
npm.cmd run build
```

Jika memakai source baru tanpa `node_modules`, jalankan `npm.cmd ci` sekali terlebih dahulu.
