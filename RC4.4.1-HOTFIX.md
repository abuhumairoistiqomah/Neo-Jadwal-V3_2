# E-JADWAL V3.19 RC4.4.1 — Regression & migration-layout hotfix

Fixes ONLY two test failures: outdated RPC expectation and duplicated Supabase migration timestamp.
No app runtime, schema function, database data, or secret changes.

## Install over existing V3.19 RC4.4

1. Extract this ZIP to the **e-jadwal-v3.19 project root**, replacing the 2 test files.
2. Run the included PowerShell cleanup **from the same project root**:
   `powershell.exe -NoProfile -File .\apply-RC4.4.1.ps1`
   The cleanup removes ONLY the duplicated read-only verifier from `supabase/migrations`.
   The verifier's same contents are now in `supabase/verifiers/rc4_4_team_teaching_tasks_readonly.sql`.
3. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.

If preferred, skip the script and remove only:
`supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks_verify.sql`
using File Explorer or `Remove-Item` manually.

Do not delete the real migration:
`supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks.sql`.
If the real migration was already applied, DO NOT rerun it just for this fix.

This is a packaging/test-only change. RC4.4.1 has NO NEW SQL MIGRATION.
