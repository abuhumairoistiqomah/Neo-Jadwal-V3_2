# TRACE V3.13.2 — Smart Quick Editor + Waiting Badal Auto-Expiry

## Scope

V3.13.2 closes two operational gaps discovered during live V3.13.1 use:

1. Quick Edit teacher selection should reuse the useful part of the badal UX without importing the entire substitute-scoring engine.
2. Past leave-workflow coverage must not remain actionable in Waiting List Badal after its date has passed.

## Smart Quick Editor

- Active teachers only.
- Teacher list is ranked primarily by class gender compatibility.
- Same-period teacher occupancy is shown as a **warning**, not a hard ban.
- A selected teacher with an existing assignment can still be saved after explicit Admin confirmation.
- Class-slot conflicts and room-slot conflicts remain hard validation errors.
- Server RPC `ejadwal_update_schedule_master_v2` revalidates teacher occupancy. A conflict that appears after the browser loaded requires explicit override; the override and conflict details are written to `audit_logs`.

## Waiting Badal Auto-Expiry

- New coverage status: `EXPIRED`.
- `LEAVE_WORKFLOW + WAITING` rows with `schedule_date < schoolToday` are converted to `EXPIRED` by `ejadwal_expire_stale_waiting_coverage(date)`.
- The frontend passes the explicit Asia/Jakarta school date.
- Waiting-list reads additionally apply `schedule_date >= schoolToday`, so stale rows cannot reappear in the active queue.
- If the approval screen remains open across Jakarta midnight, it refreshes automatically when the school date changes.
- EXPIRED rows are excluded from the canonical operational schedule snapshot but retained in PostgreSQL and audit history.
- The active coverage uniqueness index treats EXPIRED as historical/inactive, like CANCELLED.

## Migrations

- `202610090032_v3_13_2_smart_editor_waiting_expiry.sql`
- `202610090033_v3_13_2_verify_smart_editor_waiting_expiry.sql`

Verifier target: **8 / 8 true**.

## No GAS change

`Code.gs` is unchanged. No Apps Script redeploy or OAuth reauthorization is required.
