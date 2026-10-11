# TRACE V3.5 — Supabase Staging + Repository + Auth/RLS Foundation

## Goal

Introduce the new persistence boundary without changing any existing E-Jadwal screen or production behavior.

V3.5 is deliberately a **parallel foundation**, not a cutover.

## What changed

### Browser Supabase client

Added:

```text
src/infrastructure/supabase/client.ts
src/infrastructure/supabase/diagnostics.ts
src/vite-env.d.ts
```

The browser client accepts only:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

No secret/service-role key exists in frontend configuration.

### Auth foundation

Added:

```text
src/infrastructure/auth/supabaseAuthRepository.ts
```

It supports:

- password sign-in;
- sign-out;
- reading current profile;
- reading current application roles.

There is intentionally no public sign-up workflow in V3.5.

### Repository boundary

Added:

```text
src/infrastructure/repositories/scheduleRepository.ts
src/infrastructure/repositories/supabaseScheduleRepository.ts
src/infrastructure/repositories/supabaseScheduleMappers.ts
```

The relational adapter maps PostgreSQL rows back into the existing domain shapes:

```text
Teacher
ScheduleItem
JadwalInsidentalItem
LogIzinItem
MasterRuanganItem
KalenderAkademikItem
```

Therefore the V3.3 canonical engine still does not know or care whether its data comes from Apps Script, Sheets, PostgreSQL, fixtures, or a future source.

### Important explicit limitation

The V3.4 database schema supports an incidental teacher override action `CLEAR`.
The current V3.3 legacy-compatible domain model represents blank teacher values as **inherit master**.

V3.5 therefore refuses to silently map `CLEAR`. The mapper throws a clear error if such a row appears.

This is intentional: silent corruption is worse than an explicit unsupported-state error.
No staging data uses `CLEAR` yet.

### RLS / API grants

Added migration:

```text
202610030002_v3_5_auth_rls_foundation.sql
```

Security model:

```text
ANON
  -> no E-Jadwal table privileges

TEACHER
  -> read shared schedule/master data
  -> own leave requests
  -> own/assigned badal slots
  -> own learning-task content + assigned task read

WAKASEK
  -> operational leave/badal/task management
  -> read audit data

ADMIN
  -> master/schedule/configuration writes
  -> role/profile management
  -> staff workflow access
```

Audit log writes remain closed to browser clients in V3.5.

## Deliberately NOT changed

- `App.tsx` still loads the live/staging legacy Apps Script data path.
- Existing Dashboard components are untouched.
- Input Inval is untouched.
- Canonical V3.3 schedule engine is untouched.
- No spreadsheet rows are imported into Supabase.
- No file bytes are stored in Supabase.
- No Supabase Storage bucket is created.
- No production cutover occurs.

## Test target

V3.4 baseline:

```text
53 tests
```

V3.5 adds mapper characterization tests for the relational-to-domain boundary.

Expected total after `npm test`:

```text
62 tests
0 fail
```

## Next phase

V3.6 should be **Data Migration + Parity Harness**, not consumer cutover.

Recommended sequence:

1. export duplicated staging Sheet data;
2. transform/import into Supabase staging;
3. compare Apps Script snapshot vs Supabase repository snapshot;
4. compare canonical effective-schedule outputs for representative dates/weeks;
5. fix data/mapping divergence;
6. only then move Dashboard consumers.
