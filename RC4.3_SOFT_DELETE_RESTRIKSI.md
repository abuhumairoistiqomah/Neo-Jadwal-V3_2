# E-JADWAL V3.19 RC4.3 — Restriction Soft Delete & Badal Cascade

When an *Aturan Guru Badal* restriction is deleted or switched off, its associated `OFFICIAL_DUTY` coverage must be removed from the **active** Log Badal and from effective teaching overrides. Historical rows remain soft-deleted and auditable.

## Requirements
- RC4.2 deployed; run `202610210003_v3_19_rc4_3_constraint_soft_delete_cascade.sql` on **staging** before updating the frontend.
- Admin/WAKASEK can Soft Delete with a mandatory reason, choose **Lihat soft delete** and **Pulihkan (Nonaktif)**, or set **Nonaktif**. Deactivation also clears derived coverage, avoiding the pre-existing bug.
- `RESTORE` does **not** restore historical substitute decisions. Reactivate the rule explicitly and assign substitute coverage again if still needed.
- Only `coverage_slots.source='OFFICIAL_DUTY'` with an exact matching `official_duty_constraint_id` is modified; independent LEAVE_WORKFLOW, ADMIN_MANUAL, LEGACY_IMPORT, other teachers' coverage, and master/incidentals are untouched.
- Linked learning tasks are soft-deleted as well; the audit trail records the action and counts.
- Migration reconciles active orphaned coverage caused by already-inactive restrictions.

## Staging checks
1. Record current teacher schedule, Log Badal and WA listing; choose a restriction with a known `OFFICIAL_DUTY` badal.
2. Soft Delete it and enter a reason. Its slots must disappear from active Log Badal, effective override and public feed without manual incidental edits.
3. Confirm independent leave/badal for that teacher still exists. Refresh page and verify behavior persists.
4. Show deleted rules; Restore. Rule returns **Nonaktif**. No canceled badal magically returns; explicitly activate if needed.
5. Try switching an active restriction to **Nonaktif**: linked slots should also disappear.
6. Check one pre-existing inactive restriction with old badal: migration must have reconciled only its linked `OFFICIAL_DUTY` slots.
7. Run `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`.

## Caution
- The UI count is a preview from the current snapshot; the RPC performs the authoritative operation transactionally in the database.
- If a historical row has no `official_duty_constraint_id`, it is **not automatically modified**. Such an unlinked row cannot be safely attributed to one restriction; review it separately.
- Back up the affected rows and audit records before running this migration on production.
