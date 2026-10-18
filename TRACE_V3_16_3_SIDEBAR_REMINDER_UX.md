# TRACE V3.16.3 — Navigasi Kategori & Reminder UX

## Tujuan

- Pengingat Dashboard dapat disembunyikan langsung dari posisi paling bawah daftar agenda, tanpa scroll balik.
- Sidebar guru mudah dipindai: Dashboard, Jadwal, Perizinan, Statistik.
- Sidebar Admin juga dikelompokkan mengikuti fungsi, bukan urutan historis penambahan fitur.

## Implementation notes

- `src/components/EducationReminder.tsx`: footer dua tombol, icon chevron-up, `setExpanded(false)`; `aria-label` eksplisit; status header mencerminkan expanded/collapsed, dan `useState(false)` dipertahankan.
- `src/App.tsx`: urutan `navItems` dan atribut `section` dipakai desktop, collapsed, dan mobile. Tidak ada perubahan route ID atau role dan navigasi Admin.
- Tidak menyentuh query pendidikan, RLS, database, jadwal mengajar, atau rules badal.

## Status dan keterbatasan

Kandidat RC1. Test fokus 9/9 dan syntax 211/211 OK; test build yang menggunakan dependency penuh belum dapat dijalankan offline. Jalankan release gate lengkap dan UI smoke test sebelum deploy.
