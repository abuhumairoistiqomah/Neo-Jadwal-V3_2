# E-JADWAL V3.20 RC1.6 — Statistik Hari Izin (Director View)

**Baseline:** V3.20 RC1.5.2. **Status:** Staging candidate, not deployed.

New Management Analytics tab: **Statistik Hari Izin**. Provides weekly (daily bars), monthly (monthly bars), semester (school half-year bars) and annual (year bars), custom start/end, category filter, teacher-day KPIs, previous-window comparison, teacher ranking, period breakdown and CSV. Legacy JP tab remains unchanged.

**Counting:** Teacher × calendar day, deduplicated across JP, classes and—only on the ALL filter—categories. Ranking excludes placeholder teachers. Official duty, approved leave and historical categories are read through a staff-only Supabase RPC; no sensitive reason text is transmitted.

**Migration:** `202610240001_v3_20_rc1_6_management_leave_days.sql` creates `ejadwal_management_leave_days_v320(date,date)` with privileges restricted to authenticated staff and range checking up to 1462 inclusive days. No existing records altered.

**Verification:** domain test `npm.cmd run test:days` passed 6/6; 271 TS/TSX source files passed TypeScript syntax parsing. Full `tsc`, Vite build and PostgreSQL execution not verified because runtime dependencies/PostgreSQL service were unavailable locally.

**Patch** excludes `.env.local` and `package-lock.json`. **Full Source PERSONAL** contains the project `.env.local`; don't share it. **SHAREABLE** excludes it.

See `INSTALL_RC1_6.md` for staging rollout and acceptance checklist.
