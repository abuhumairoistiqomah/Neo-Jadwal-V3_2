# Supabase — E-Jadwal V3

## Applied migrations

1. `202610030001_v3_4_initial_schema.sql`
   - core relational schema
   - 15 tables
   - RLS enabled, no end-user policies

2. `202610030002_v3_5_auth_rls_foundation.sql`
   - explicit authenticated grants
   - anon table access revoked
   - role/security helper functions
   - RLS policies for ADMIN / WAKASEK / TEACHER

3. `202610030003_v3_5_verify_security.sql`
   - read-only verification queries

## Important

- Supabase Storage is intentionally unused.
- Actual files remain in Google Drive.
- Browser code uses only the publishable key.
- Secret/service-role keys must never be placed in frontend source or `VITE_*` variables.
- Google Sheets data is not imported until repository parity is proven.

4. `202610050004_v3_5_2_substitute_constraints.sql`
   - recurring/date-specific substitute constraints
   - soft-ban foundation with explicit `override_allowed`
   - `coverage_constraint_overrides` evidence table
   - RLS: teacher can read own constraints; WAKASEK/ADMIN manage them

5. `202610050005_v3_5_2_verify_substitute_constraints.sql`
   - read-only verification queries for the two V3.5.2 tables and policies

6. `202610070014_v3_11_inval_write_cutover.sql`
   - atomic staff-only badal create/update/delete RPCs
   - server-side substitute-constraint validation
   - audit trail + soft-ban override evidence
   - optional room relocation in the same write transaction

7. `202610070015_v3_11_verify_inval_write_cutover.sql`
   - read-only verifier for RPC grants, audit boundary, RLS evidence, and active duplicate coverage
