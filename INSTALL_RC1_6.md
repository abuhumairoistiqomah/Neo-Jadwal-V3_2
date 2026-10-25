# V3.20 RC1.6 — Statistik Hari Izin Guru

A new **Statistik Hari Izin** tab appears in **Management Analytics** beside **Beban Operasional (JP)**.

## Definition

- **Guru-hari** means **one unique teacher + date**; multiple JP/classes count once.
- The **Semua Jenis** filter deduplicates teacher/date across PERSONAL, SCHOOL_DUTY, and UNCLASSIFIED.
- Category filter recalculates bar charts, ranked teachers, table details and KPI numbers.
- Data sources: approved `leave_requests` periods; active `OFFICIAL_DUTY` coverage; active legacy/manual imported coverage. Priority by unique teacher/date/JP: APPROVED > OFFICIAL_DUTY > LEGACY/MANUAL.
- Teacher placeholder `Guru belum ditentukan` is excluded. Historical imported names resolve only if unique.
- These are **absence-from-teaching/operational unavailability** days, **not proof of physical attendance**.
- **Semester** follows the academic half-years July–December and January–June.
- **Change vs previous window** compares immediately preceding calendar days of equal length (not matched weekdays/school operational days).
- The RPC never returns private reason text; only date, teacher identity, and category, and is staff-gated.

## Install from RC1.5.2

1. Back up your source and Supabase database.
2. Apply `supabase/migrations/202610240001_v3_20_rc1_6_management_leave_days.sql` in **staging**.
3. Run `SQL_VERIFY_RC1_6_LEAVE_DAYS.sql` in Supabase SQL Editor. Expect `security_definer=true`, `authenticated_can_execute=true` and `anon_can_execute=false`.
4. Extract the patch **onto RC1.5.2 project root**, preserving your local `.env.local` and fixed `package-lock.json`.
5. `npm.cmd run lint`, `npm.cmd run test:days`, `npm.cmd run test:320`, `npm.cmd run build`.
6. Test new tab with 7-day custom date range, different category filters, and the teacher-day deduplication case. Check results against individual statistics.

No new runtime dependency or changed old operational KPI. The new tab won't work until the migration is installed.

**Deployment caution:** PostgreSQL migration and a full Vite build could not be executed on the creator's isolated environment. Treat as staging candidate. The test:days suite is runnable with Node 22; the full suite requires project dependencies.

**Package lock:** patch does not overwrite it; because the package version changed, run `npm.cmd install` to update your local lockfile if `npm ci` reports a mismatch. Full source keeps the baseline lockfile with root version synchronized; dependency consistency still needs a local `npm install` if applicable.
