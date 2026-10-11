# V3.13.1 FIX — JP-0 regression tests + Vite env typing

This corrective package does not change the V3.13.1 runtime behavior or database schema.

## Fixes

1. Legacy leave-request tests are updated for the new JP-0 contract:
   - JP-0 is present before JP1 when the school day is active.
   - Non-homeroom teachers receive JP-0 as FREE/statistics-only.
   - Tests targeting a teaching period now locate it by `period` instead of assuming `slots[0]`.
2. `src/infrastructure/supabase/client.ts` explicitly types the optional Vite env record so `tsc --noEmit` accepts `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

No Supabase migration and no Apps Script redeploy are required.
