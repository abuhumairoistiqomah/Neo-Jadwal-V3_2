# V3.14.6 RC3.4.6 — Legacy soft cancellation, canonical WA URL, free-JP leave correction

Based on **RC3.4.5**. Production must remain unchanged until staging verification.

## Scope

1. `Log Izin & WA` can soft-cancel an imported historical (`LEGACY_IMPORT`) coverage row via the original delete RPC, now revised to accept imported history **for ADMIN only**. WAKASEK can still cancel operational rows as before. Rows receive `status=CANCELLED`, `deleted_at`, and `deleted_by`; no physical deletion. Full before/after audit (`LEGACY_COVERAGE_SOFT_CANCEL`) retained. A trigger prevents old imported cancellations from being accidentally resurrected.
2. Broadcast WA uses the real public URL `https://neojadwalv3.vercel.app/` even while copied from localhost or preview. No V1 link remains in this template.
3. Existing single-day Mar'i leave can have missed **FREE** periods added by an authenticated ADMIN/WAKASEK after duplicate submission rejection. No second request, no coverage/badal rows, and approval remains unchanged. Each added period is audited. UI shows only server-verified missing FREE JPs.

## REQUIRED SQL migration

`supabase/migrations/202610120001_v3_14_6_legacy_cancel_leave_free_amendment.sql`

Run **after** `202610110053` on Supabase **staging**. This supersedes only the runtime behavior of `ejadwal_delete_inval_assignment`; the older SQL history file remains untouched. No Apps Script deployment required.

## Staging checklist

- Login ADMIN. Cancel one test `LEGACY_IMPORT` log (confirm removal from active log after refresh), check row in Supabase has `status=CANCELLED` and `deleted_at` and an audit log exists; test WAKASEK cannot cancel LEGACY_IMPORT.
- Cancel one operational test log, confirm audit remains.
- Copy WA broadcast from localhost; paste should link to neojadwalv3.vercel.app.
- Trigger duplicate active leave for a test teacher/date; signed-in ADMIN should see existing request code, server-eligible missing FREE JPs; append exactly one JP and verify `leave_request_periods`, with no new `leave_requests` or `coverage_slots` rows. Retry same JP to confirm duplicate guard.
- After completion, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and test production-equivalent sessions before Vercel push.

## Safety

- Legacy historical source/snapshots remain intact. Soft-deletion is not a way to delete actual approved teacher leave; it removes a badal log entry only. Correct or cancel actual `leave_requests` in the approval workflow.
- Correction is restricted to single-day SUBMITTED or APPROVED requests and periods without effective teaching. For missing teaching coverage, use approval/admin process instead of marking those periods FREE.
- SQL/production database behavior has not been executed in this build environment.
