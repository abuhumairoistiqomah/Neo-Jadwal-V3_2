# TRACE V3.14.6 RC3.4.7 — Edit Log Badal

Based on RC3.4.6. Scope only: edit the substitute teacher on an existing coverage slot from **Log Izin & WA**.

- New **Edit Badal** action in desktop rows and mobile cards.
- Searchable dropdown of actual teacher IDs, not free-text submissions. Prefills current substitute.
- Shows a warning when the candidate is already a substitute for another class at the same date and JP (not necessarily a conflict when classes share a session).
- **Replaces only one coverage slot**. Combined-class sessions with multiple slots must be checked and corrected per class; do not silently update several unrelated records.
- Existing `learning_tasks`, task-resource URLs, leave request, absent teacher, date, period and class are **not modified**.
- The Supabase RPC enforces staff login, active status, hard constraint validation, and acknowledgements plus reason for soft constraints. Legacy imported rows require ADMIN.
- Every change generates a before/after audit entry with a new request ID.
- Existing reminder / broadcast WA continues to use the latest snapshot, and still links to public V3.
- Legacy imported correction is protected from future reimport by a dedicated flag + trigger. Previously cancelled legacy rows remain cancelled by the RC3.4.6 trigger.

## Required migration

After `202610120001_v3_14_6_legacy_cancel_leave_free_amendment.sql`, run:

`supabase/migrations/202610120002_v3_14_6_badal_reassignment.sql`

**Test in staging first.** This SQL has not been tested against a live PostgreSQL instance in the preparation environment.

## Manual release checks

1. `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
2. Choose one existing active badal with an attached task link. Edit Badal -> different teacher -> save -> refresh: new teacher in Log and WA; task/link unchanged.
3. Confirm old teacher and new teacher appear in the audit entry.
4. With a soft constraint, editor requests explicit acknowledgement and reason. Hard constraint remains rejected.
5. Attempt old legacy entry as ADMIN; verify corrected substitute survives a reimport in staging.
6. Verify editing an unrelated slot on same date/JP does not change this log, and cancellation remains soft delete.

Limitations: candidate warnings in the modal detect duplicate **badal assignments** at the same date/JP, not all canonical teaching collisions. Refer to the effective teacher schedule for final assignment verification. SQL protects explicit substitute constraints; it does not independently certify all other schedule conflicts.
