# Patch V3.16.1 → V3.16.2 (Kalender Pendidikan: Soft Delete + Restore)

- Apply SQL migration BEFORE frontend patch: `supabase/migrations/202610180001_v3_16_2_education_calendar_soft_delete.sql` (also available as standalone file).
- Extract this patch into the existing V3.16.1 project root; preserve relative paths.
- ADMIN: Hapus (soft delete) with confirmation; "Tampilkan kegiatan terhapus" off by default; Pulihkan retains original status.
- Not a hard delete. Public and staff RLS exclude deleted rows. No academic calendar, class or teacher schedule modifications.
- Run `npm.cmd ci && npm.cmd test && npm.cmd run lint && npm.cmd run build` and test on staging before production.
- Full browser/live Supabase test not completed here. RC1 only.
