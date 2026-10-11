# E-Jadwal V3.5 — Supabase Staging Setup

This phase wires the application architecture to Supabase without migrating any existing screen yet.

## Boundary

```text
React / Vercel
   |
   +-- Supabase Auth
   +-- Supabase repository adapter --> PostgreSQL
   +-- Apps Script Drive bridge -----> Google Drive
```

Google Drive remains the file store. Supabase Storage is not used.

## Browser credentials

Use only:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

The publishable key is intentionally browser-visible and relies on RLS for authorization.
Never put a Supabase secret key/service-role key in a `VITE_*` variable or commit it to source control.

## Dashboard setup

1. Keep the project in the Tokyo region.
2. Keep **Enable Data API** on.
3. Keep **Automatically expose new tables** off.
4. Keep RLS enabled.
5. In Authentication settings, disable public self-signup for the school app. Users should be created/invited by an authorized administrator until a controlled onboarding flow is designed.

## Apply V3.5 security migration

After the V3.4 schema exists, run:

```text
supabase/migrations/202610030002_v3_5_auth_rls_foundation.sql
```

Then run the read-only verifier:

```text
supabase/migrations/202610030003_v3_5_verify_security.sql
```

Expected:

- all 15 E-Jadwal tables have `rowsecurity = true`;
- policies exist for authenticated access;
- the `anon` role has no table privileges on the E-Jadwal public tables.

## Bootstrap the first ADMIN

Create the first user from Supabase Dashboard -> Authentication -> Users.
Do not use a secret key in the browser.

After the user exists, copy only the Auth user's UUID and run this in SQL Editor, replacing the placeholder UUID and display name:

```sql
begin;

insert into public.user_profiles (user_id, display_name, is_active)
values ('REPLACE_WITH_AUTH_USER_UUID', 'Administrator', true)
on conflict (user_id) do update
set display_name = excluded.display_name,
    is_active = true;

insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_AUTH_USER_UUID', 'ADMIN')
on conflict (user_id, role) do nothing;

commit;
```

This manual bootstrap is intentionally limited to the first admin. Later user/role management should be handled by trusted application/server workflows.

## Local V3.5 configuration

Copy:

```text
.env.example -> .env.local
```

Fill the project URL and publishable key from Supabase's **Connect** dialog.

Then run:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The application should still behave exactly like V3.4 because no current screen has been switched from Apps Script to Supabase yet.

## Repository layer

The new adapter is intentionally read-only:

```text
src/infrastructure/repositories/SupabaseScheduleRepository
```

It reconstructs the existing domain contracts from relational rows so the canonical V3.3 effective-schedule engine stays persistence-independent.

V3.5 does **not** import Sheet data and does **not** cut over any consumer screen.
