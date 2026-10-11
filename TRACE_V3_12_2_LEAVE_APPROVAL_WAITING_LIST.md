# TRACE V3.12.2 — Wakasek Leave Approval + Badal Waiting List

## Scope

V3.12.2 activates the privileged half of the leave workflow introduced in V3.12/V3.12.1:

```text
PUBLIC FORM
  -> SUBMITTED
  -> Wakasek/Admin review
      -> DECLINED (stop)
      -> APPROVED
          -> TEACHING class rows become coverage_slots / WAITING
          -> FREE JPs remain leave_request_periods only
          -> Waiting List Badal
          -> Proses Badal opens canonical Supabase Inval Write
          -> ASSIGNED
```

## Security boundary

- Public/anonymous users still only submit leave through the V3.12.1 public RPC.
- Decision RPC `ejadwal_decide_leave_request` requires an authenticated user for whom `current_user_is_staff()` is true (`WAKASEK` or `ADMIN`).
- `anon` has no execute privilege on the decision RPC.
- Approval is atomic: request decision + WAITING coverage materialization + audit happen in one database transaction.
- The server revalidates each requested teaching slot against the current effective schedule before approval. Stale/changed assignments fail closed.

## FREE period semantics

`leave_request_periods(period_type='FREE')` is attendance/statistics data only.

It never creates a row in `coverage_slots`, therefore it never enters the Badal Waiting List.

## Combined classes

Persistence remains one `coverage_slots` row per concrete class. The Waiting List UI recombines rows sharing:

- same leave request
- same date
- same JP
- same absent teacher
- same subject

into one operator-facing session, preserving the V3.12.1 inferred-combined semantics.

## Badal hand-off

`Proses Badal` opens:

```text
?supabase-inval-write=1
  &date=YYYY-MM-DD
  &teacher=<absent teacher>
  &period=<JP>
  &reason=<leave reason>
  &leave=<IZN code>
```

The V3.11 Supabase Inval writer is reused. It already updates an existing non-legacy coverage identity, so a `LEAVE_WORKFLOW / WAITING` row becomes `ASSIGNED` instead of creating a parallel coverage row.

## New migration

- `202610080020_v3_12_2_leave_approval_waiting_list.sql`
- `202610080021_v3_12_2_verify_leave_approval_waiting_list.sql`

## Staging route

```text
/?supabase-leave-approval=1
```

The normal admin sidebar also exposes **Persetujuan Izin**. The page still requires independent Supabase Auth staff authorization before any queue data or decision action is available.

## Regression targets

1. SUBMITTED request is inert before approval.
2. DECLINE creates zero coverage rows.
3. APPROVE with TEACHING + FREE creates coverage only for TEACHING class slots.
4. Combined class coverage remains separate in Postgres but one session in Waiting List UI.
5. Approval cannot execute anonymously.
6. A stale teaching assignment fails approval rather than silently creating invalid coverage.
7. Waiting List hand-off prefills date, teacher, JP, and reason in Supabase Inval Write.
8. Inval assignment changes existing LEAVE_WORKFLOW/WAITING coverage rows to ASSIGNED.
