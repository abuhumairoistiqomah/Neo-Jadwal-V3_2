# E-JADWAL V3.20 RC1 — Leave Classification & Badal Integration

## What changed

- Ajukan Izin: **Jenis Izin** = Urusan Pribadi / Tugas Sekolah, distinct from **Cakupan Izin** = Sehari penuh / Sebagian JP. Default is Urusan Pribadi; classification is not an approval.
- Existing public-evidence and staff-direct submit workflows now call `ejadwal_submit_public_leave_request_v320` / `ejadwal_submit_staff_leave_v320` to write the category atomically with the original request. Existing approval safeguards remain in their respective original RPCs.
- Approval queue shows the category. Approved Leave Maintenance shows and can correct the category, requiring an explicit note and server audit.
- Aturan Guru Badal identifies actual official-duty leave requirements as **Tugas Sekolah**. Personal leave is still a distinct workflow and is not duplicated into substitute constraints.
- Individual teacher statistics show a category breakdown and reason-table selector. Approved leave category comes from its request; `OFFICIAL_DUTY` coverage from an active, non-deleted rule is `SCHOOL_DUTY`; legacy without verified category is `UNCLASSIFIED`.
- Management Analytics shows a category breakdown/filter independently of six unchanged operational KPIs V3.18. Source-level category queries deduplicate teacher/date/JP.
- No changes to approved/unapproved status semantics, badal availability, saved schedules, or physical attendance.

## Prerequisites

Apply all V3.19 migrations through `202610210005_v3_19_rc4_4_3_mq_student_transfer.sql` first. Back up Supabase and test V3.20 migration in staging before production.

## Database

Run `supabase/migrations/202610220001_v3_20_leave_classification.sql` **once in staging**. Then run `supabase/verifiers/v320_leave_classification_readonly.sql`. The verifier is **not** a migration.

The new `leave_requests.absence_category` values are `PERSONAL`, `SCHOOL_DUTY`, and `UNCLASSIFIED`. `UNCLASSIFIED` is a historical/storage state, **not a third UI option**. Existing records are NOT categorized by keyword guesswork. An authorized user can classify an approved historical request with an explicit audit note.

New queries and forms require migration. No fallback silently substitutes zero when RPC is missing. Staff authorization and evidence safeguards of original RPCs are reused.

## Manual staging checks

1. Form: choose Personal, Full Day, submit a test request with proper evidence/authorization, confirm `leave_requests.absence_category = PERSONAL`.
2. Form: choose School Duty, Partial, verify same persistence and no unexpected automatic approval.
3. Test School Duty via Aturan Guru Badal: one teacher/date/JP counts once even for joined classes. Avoid duplicate leave request for the same duty.
4. Approve a submitted request, see its category in approval queue and individual statistics.
5. In Approved Leave Maintenance, change classification of an approved historical request with an audit note; verify `audit_logs` and reloaded statistics.
6. Individual Stats: personal, school, and unknown categories; same date may appear in multiple categories, but JP are deduplicated.
7. Management Analytics: changing category filter affects category summary but DOES NOT silently reinterpret old six KPIs.
8. Ensure generic substitute restrictions are not mislabeled as school-duty unless they genuinely replace teaching.
9. Verify legacy reason strings and `UNCLASSIFIED` untouched; records declined/cancelled/deleted must not count in V3.20 summary.

## Testing and current caveats

A local substitute TypeScript ESM loader (not distributed) ran **535/535** applicable regression checks including V3.20. Two dependency-importing test files could not run because external packages `react` and `@supabase/supabase-js` are unavailable in this environment. Source parse check: **260 TS/TSX**. Domain-only `tsc --noEmit`: PASS. Full project `tsc`, Vite build, and live Supabase migration NOT yet validated. Run on local machine:

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

For a patch applied on a working RC5 with dependencies already installed, `npm install` is needed only if lockfile/package state requires it; no new external dependency was added. Old upstream lockfile in Full Source may be stale — use `npm install`, not `npm ci`, until synchronized.

## Security and packaging

PERSONAL ZIP includes user's `.env.local` (sensitive); do not share. SHAREABLE and PATCH intentionally exclude `.env.local` and private API key values. `.gitignore` excludes `.env.local`; it does not protect ZIPs.

## Known boundaries / potential follow-on

- The Log Izin & WA public broadcast does not gain private leave-classification details. A future authorized staff list filter can be implemented separately without exposing confidential reasons to guests.
- Official duties without a recorded `OFFICIAL_DUTY` coverage slot are still explained in V3.19 Duty Log and are not invented as teacher JP leave in V3.20 category stats.
- Management's category filter applies to the additional category breakdown, not retroactively to canonical V3.18 six-metric table.
- Missing absent-teacher IDs on imported historical coverage may not be included in all-teacher category aggregates; records remain historical/unclassified until reconciled.
