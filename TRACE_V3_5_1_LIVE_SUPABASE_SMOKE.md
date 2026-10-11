# TRACE V3.5.1 — Live Supabase Smoke Test

V3.5.1 is a staging-only verification checkpoint. It does **not** migrate production consumers away from Google Apps Script and it does **not** import Spreadsheet data yet.

## Goal

Verify the real Supabase project with the browser-safe publishable key and a real Auth user:

1. Vite environment is configured.
2. Anonymous access to operational tables is blocked.
3. Supabase Auth session resolves the matching `user_profiles` / `user_roles` row.
4. ADMIN role is recognized by the database helper used by RLS.
5. Authenticated reads can access `teachers`, `classes`, and `rooms` even while the tables are still empty.
6. ADMIN can perform a temporary write to `rooms`, followed immediately by cleanup.

## Safety

The smoke page never stores the entered password itself. Supabase Auth may persist the resulting session in browser storage, which is expected for the staging client. Use the Logout button when finished.

The write probe uses an ID beginning with `__SMOKE_TEST__`, cleans stale smoke rows first, inserts one temporary room, then deletes it immediately.

No Supabase secret/service-role key is used or required.

## How to run

Keep `.env.local` local to the machine:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

Then:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Open:

```text
http://localhost:3000/?supabase-smoke=1
```

Login using the Supabase Auth ADMIN account and click **Run Smoke Test**.

Expected result:

```text
6/6 PASS
```

The normal E-Jadwal UI remains available at:

```text
http://localhost:3000/
```

## Deferred

V3.5.1 intentionally does not test TEACHER/WAKASEK denial/allow matrices yet because only the bootstrap ADMIN account is required at this checkpoint. Those role-specific negative tests should be performed after test identities are created, before the leave workflow is released.
