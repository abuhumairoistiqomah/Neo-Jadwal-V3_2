# V3.6 Legacy Migration Runbook

1. Back up the staging Spreadsheet and Supabase staging project.
2. Update the staging Apps Script with V3.6 `Code.gs` and deploy a new version of the existing Web App deployment.
3. Confirm the `/exec?migration=1` response works. Do not share the response if an older backend still includes credentials.
4. Apply Supabase migration `202610050006_v3_6_legacy_import_support.sql`.
5. Run verifier `202610050007_v3_6_verify_legacy_import_support.sql`; expect five legacy-key indexes.
6. Copy `.env.local` from V3.5.2 into the V3.6 project folder.
7. Run `npm.cmd install`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
8. Run `npm.cmd run dev` and open `/?supabase-migrate=1`.
9. Login as ADMIN, Fetch + Analyze, and stop if any BLOCKING issue appears.
10. When blockers are zero, type `MIGRATE`, import, then Verify Counts.
11. Preserve the result screenshot / counts as the V3.6 migration checkpoint.

Do not switch the normal E-Jadwal screens to Supabase during this step.
