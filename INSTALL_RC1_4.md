# Instalasi RC1.4 (dari V3.20 RC1.3)

1. Backup code dan Supabase staging.
2. Jalankan `supabase/migrations/202610230003_v3_20_rc1_4_waiting_approved_subject_override.sql` di SQL Editor.
3. Jalankan `v320_RC1_4_READONLY_VERIFIER.sql` dan pastikan RPC muncul.
4. Ekstrak file ZIP patch ini ke root proyek RC1.3; pertahankan `.env.local` dan `package-lock.json` milikmu.
5. Jalankan `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`.
6. Uji Waiting List pengajuan APPROVED: ubah mapel kelas JP2 dan simpan; cek log, insidental dan jadwal efektif. Pastikan tidak menambah pengajuan izin.

Lihat `v320_RC1_4_WAITING_APPROVAL_SUBJECT_OVERRIDE.md` untuk penjelasan lengkap dan batasan.
