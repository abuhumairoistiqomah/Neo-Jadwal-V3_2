# E-JADWAL V3.18 RC1 — Log Izin & WA + Teacher Operational Activity

**Baseline:** V3.17.3 RC3.1 Restriction Input Lag Hotfix. **Status:** staging candidate, NOT production-verified.

## Changes

1. **Log Izin & WA**: past `tanggal` records are hidden by default using **Asia/Jakarta** date; today and future remain visible. A checkbox **Tampilkan yang sudah lewat (N)** restores historical rows. No rows are deleted or rewritten; editing, broadcast, and per-record reminder behavior remain available when shown. Unknown/invalid dates are retained instead of silently hidden. The view updates the school date every minute while open.
2. **Management Analytics > Beban Operasional Guru**: the old mixed historical columns are replaced by **Total JP Mengajar Efektif**, **Total JP Izin**, **Total Hari Mengajar Efektif**, **Total Hari Izin**, **Persentase JP Mengajar**, **Persentase JP Izin** (+ mandatory Guru identifier). All seven headers are clickable with ascending/descending sorting, `aria-sort`, and visible arrow icons. CSV export uses the six new metrics and current filtered/sorted order.
3. **Staff-only RPC** `ejadwal_teacher_effective_activity_v318(date,date)` calculates date-scoped activity from master teaching, incidentals, approved leave, legacy/manual teaching absences, assigned substitutes, calendar cancellation, and recorded non-teaching official duties. It is merged with the original management analytics RPC; the existing summary KPIs, trends, reasons and coverage analytics are not redefined.

## Metric policy (IMPORTANT)

- Teaching JP is **recorded/scheduled operational instruction**, not proof of physical attendance. Counts are deduplicated by **teacher UUID + date + JP** (a combined session is one JP).
- JP0 **excluded**. Approved leave of type **FREE** does not add to `Total JP Izin` but its date does add to `Total Hari Izin`. An APPROVED **TEACHING** JP 1–6 is counted as leave, including JP of historical coverage records from LEGACY_IMPORT / ADMIN_MANUAL, but **OFFICIAL_DUTY** is not categorized as personal leave.
- Badal assigned/completed is teaching. Non-teaching incidental events detected by explicit `reason`/`incidental_type` (`pengawas`, `mengawas`, `panitia`, `rapat`, etc.) are excluded from teaching. Other teachers marked as supervising (`other_teachers_supervise`) for non-Qur'an lessons are not counted as instructional teachers in secondary team positions. Qur'an/Tahsin instruction still counts co-teachers.
- Recorded approved leave, coverage absence and official-duty block suppress apparent teaching activity for the affected JP. Holiday/calendar suppression follows the operational priority rule that a new explicit dated teacher team may operate during non-holiday school events.
- `Persentase JP Mengajar = 100 * JP Mengajar / (JP Mengajar + JP Izin)`; `Persentase JP Izin = 100 * JP Izin / same denominator`. They describe the **composition of recorded JP**, not a biometric attendance rate. Zero denominator displays `—`, not 0%.
- These are **schedule-derived metrics**; unrecorded real-world deviations, ambiguous teacher positions, conflicts not resolved in the system, and inconsistent legacy teacher IDs can affect fidelity. Audit actual school cases before interpreting figures for personnel decisions.

## Installation — staging first

1. Back up current V3.17.3 RC3.1 source and Supabase DB. Confirm earlier migrations through `202610180003_v3_17_3_approved_leave_availability_guard.sql` are installed.
2. Run **only once** (idempotent `CREATE OR REPLACE`) on the **staging Supabase project**:
   `supabase/migrations/202610190001_v3_18_effective_teacher_activity.sql`
3. Run read-only check `supabase/verify_v3_18_teacher_activity_readonly.sql`. Expect **4/4 TRUE**. The staff-only RPC cannot be invoked directly through the SQL Editor without a real signed-in user (`auth.uid()` is null there).
4. Unzip full source or apply patch onto RC3.1. `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, then `npm.cmd run dev` and use a verified logged-in ADMIN/WAKASEK.
5. Open Analytics with 1–7 days to compare detailed school examples; then test 30/90-day filters. Export CSV and check the sorted order. Do not deploy to production before verifying the numbers against real classes and leave cases.

## Staging smoke tests

- Log Izin & WA: last school day hidden; today visible; tomorrow visible; checkbox reveals past; WA copy/edit/delete continue to work; confirm no Supabase write just for toggling visibility; check Jakarta midnight.
- Management table: each header click toggles ascending/descending; invalid percentage denominator shows `—`; filtered CSV contains **seven fields** (name + six KPIs), not the old columns.
- Verify examples with **one teacher/JP covering multiple combined classes**, **JP4 FREE approved leave**, **JP0**, **badal on a previously free JP**, **official non-teaching duty**, **regular class cancelled by calendar**, **one teacher shifting to an incidental teacher team**, and **date-specific teaching reassignments**.
- Confirm old management analytics KPI and daily graphs remain unchanged.

## Verification scope

- V3.18 six targeted tests passed with an isolated CommonJS transpilation runner; 229 TS/TSX files passed syntax parsing. Existing V3.14 reporting tests passed along with the new tests (11/11).
- Full dependency-backed `npm test`, `npm run lint`, `npm run build`, PostgreSQL execution and browser / Supabase live smoke tests **have not been completed** in the authoring environment. Do not represent this RC as production stable.
- New SQL only creates/replaces a staff-only reporting function with grants. It contains no DML for teaching records, leave requests, coverage assignments, or master schedules.
