# TRACE — V3.14.6 RC3.4.8.1 (Supabase-only Test Hotfix)

Base: V3.14.6 RC3.4.8.

## Root cause

`src/__tests__/teacher-owned-task-admin-runtime.test.ts` expected a historical literal comment, `Admin never bootstraps from Apps Script`, that no longer exists after the Supabase-only runtime refactor. Its absence caused `npm test` to fail even though the current application uses Supabase for both administrator and public schedule reads.

## Change

Replaced that assertion with source checks ensuring:
- Admin snapshot reads from `SupabaseScheduleRepository.loadSnapshot()`;
- Guest snapshot reads from `SupabasePublicScheduleRepository.loadPublicState()`;
- Public startup refresh uses the guest Supabase path;
- No `fetchFromAppsScript` or `publicGasBootstrappedRef` regression.

Only one test changed. Updated package version metadata to RC3.4.8.1. **No application runtime, UI, SQL, or Google Apps Script behavior changed.**

## Validations

- Both directly relevant test modules: 10/10 PASS (Node TypeScript strip-types with an extension resolver).
- Broader offline Node runner: 329 assertions PASS. Two test modules cannot load in this runner (one `.tsx` limitation, one missing `@supabase/supabase-js`), not assertion failures.
- TypeScript/TSX parser passes for all project source files.
- Full `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build` still must be run on Windows with project dependencies installed.

## Deployment

No new migration. **RC3.4.8 still requires** its existing `202610120003_v3_14_6_guest_supabase_read.sql` migration for guest Supabase reads. First validate in staging, then release to production.
