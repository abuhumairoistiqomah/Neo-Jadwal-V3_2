# E-JADWAL V3.17.2 — schema mismatch / duplicate migration version hotfix

## Why the screen fails

`List Badal Pengajuan Badal` selects `public.leave_requests.deleted_at` and `deleted_previous_status`. These were first introduced by the V3.17.2 SQL migration. PostgreSQL reports the column is absent when the frontend points to a database that has not received that migration. This is not evidence that the approved-request list is actually empty.

The uploaded V3.17.2 ZIP also contained **two migrations with the same CLI version `202610180001`**: education-calendar V3.16.2 and leave-maintenance V3.17.2. This hotfix renames ONLY the latter to `202610180002_v3_17_2_leave_maintenance_staff_submission.sql`. The SQL body is unchanged. The V3.16.2 SQL filename is unchanged.

## Safe deployment order

1. Identify the Supabase project in the app's `.env.local` (`VITE_SUPABASE_URL`) and verify it matches the SQL Editor project. Never share/publish API keys in troubleshooting screenshots. Back up source and database.
2. In **staging**, open `supabase/diagnostics/V3_17_2_READ_ONLY_SCHEMA_CHECK.sql` in Supabase SQL Editor and execute it. Note any MISSING rows.
3. If V3.17.2 columns/RPCs are missing, confirm previous required migrations are present, then run the FULL `supabase/migrations/202610180002_v3_17_2_leave_maintenance_staff_submission.sql` in staging SQL Editor, not a hand-picked ALTER TABLE. The migration runs within BEGIN/COMMIT, supplies 3 columns on `leave_requests`, 1 on `coverage_slots`, and 4 secured RPCs. **Do not run blindly if the schema has diverged or an earlier migration has failed**.
4. Re-run the read-only check: all rows must say OK. Smoke test staff listing, JP edit, soft delete and restore using test data, then promote via your deployment workflow.
5. If using the **Supabase CLI**, ensure the migration history is reconciled before `supabase db push` because renaming an already-applied migration changes its version identifier. Do not manually edit the migration-history table or replay previously-applied SQL indiscriminately.
6. Refresh the frontend after the DB migration. The UI hotfix makes failures explicit instead of incorrectly claiming `Daftar Pengajuan (0)`. The UI hotfix does **not** replace the mandatory DB migration.

## Caution

The runtime database and RLS permissions were not available in the offline audit; live success cannot be claimed. Existing V3.17.2 migration body is preserved, and no business records are touched by the diagnostic SQL.
