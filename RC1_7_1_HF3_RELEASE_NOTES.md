# E-JADWAL V3.20 RC1.7.1 HF3 — Visual Semantics Hotfix

## Fokus
Membedakan sel jadwal **INSIDENTAL** dari sel reguler pada tampilan jadwal mingguan guru agar admin dan guru dapat langsung mengenali slot hasil perubahan insidental.

## Perubahan
- Status `INSIDENTAL` pada `JadwalLengkap` (desktop) kini menggunakan palet **orange**: `bg-orange-50 text-orange-900 border-l-orange-500`.
- Status `INSIDENTAL` pada kartu mobile `JadwalLengkap` juga disamakan ke palet **orange**.
- Status `BADAL` tetap menggunakan palet **amber** seperti sebelumnya.
- Tidak ada perubahan logika data, database, Supabase, maupun algoritma penempatan badal.

## File berubah
- `src/components/JadwalLengkap.tsx`
- `src/__tests__/v3-17-2-approved-leave-maintenance.test.ts`

## Dampak pengguna
- Sesi reguler tetap biru muda.
- Sesi badal tetap amber.
- Sesi insidental kini terlihat berbeda secara jelas, termasuk kasus seperti mapel Firana / Bimbingan Karir yang berasal dari jadwal insidental.

## Instalasi
### Jika sudah di RC1.7.1 HF2
Gunakan patch HF3, lalu jalankan:

```bash
npm.cmd run lint
npm.cmd run build
```

### Jika butuh source penuh
Pakai paket PERSONAL atau SHAREABLE HF3.

## SQL
Tidak ada migrasi SQL baru.
