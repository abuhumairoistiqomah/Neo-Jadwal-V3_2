# TRACE V3.12 — Open Teacher Leave Form

## Goal

V3.12 introduces the first teacher-facing Supabase workflow directly inside the normal E-Jadwal website. Teachers do **not** need a Supabase account or admin mode to submit leave.

The form is intentionally narrow:

```text
Normal E-Jadwal
  -> Ajukan Izin
  -> SUBMITTED leave request in Supabase
```

Approval and automatic Waiting List Badal generation are deliberately **not** activated in this checkpoint. A public submission must never be able to approve itself or modify coverage/schedule data.

## UX rules locked in V3.12

1. `selectedTeacher` / `localStorage["selectedTeacher"]` remains the global "last teacher viewed" behavior.
2. Opening **Ajukan Izin** prefills that teacher automatically when the name still exists in Master Guru.
3. The teacher may change the name inside the leave form.
4. Changing the form teacher does **not** mutate the global `selectedTeacher`, so helping another teacher submit a request does not change the user's normal E-Jadwal filter.
5. Teacher options are sorted A-Z using Indonesian locale comparison.
6. No teacher login is required.

## Canonical schedule behavior

The form derives selectable slots using the existing canonical effective-schedule engine:

```text
Master
 -> Jadwal Insidental
 -> existing Log Izin / Badal
 -> Kalender Akademik
```

Only active slots where the selected teacher is officially scheduled are shown. A slot already recorded as leave/badal is excluded. A slot suppressed by Kalender Akademik is also excluded.

For **Sehari penuh**, all eligible slots are selected automatically. For **Sebagian JP**, the teacher can choose individual slots.

## Public-write security boundary

Anonymous browser users do **not** receive direct INSERT/UPDATE/DELETE access to `leave_requests` or `leave_request_slots`.

The only anonymous write path is:

```text
ejadwal_submit_public_leave_request(...)
```

The SECURITY DEFINER RPC revalidates:

- active teacher identity by name
- active class identity
- period range
- real teacher assignment for date + class + JP
- date-specific incidental teacher overrides
- academic-calendar suppression
- existing active coverage for the same absent teacher/slot
- duplicate active leave requests for the same teacher/date

The RPC always writes:

```text
status = SUBMITTED
source = PUBLIC_FORM
submitted_by = NULL
```

It cannot approve the request, assign a substitute, or alter schedules.

## New persistence

`leave_requests` gains:

- `request_code`
- `request_type` (`FULL_DAY` / `PARTIAL`)
- `source`

New table:

```text
leave_request_slots
```

It stores the exact date/class/JP rows requested. These rows are the future source for approval -> `coverage_slots` generation.

Each successful public submission also writes an `audit_logs` row with action `LEAVE_SUBMIT_PUBLIC` and returns a friendly code such as:

```text
IZN-20261012-A1B2C3
```

## SQL setup

Apply:

```text
supabase/migrations/202610070016_v3_12_public_leave_submission.sql
```

Then verify:

```text
supabase/migrations/202610070017_v3_12_verify_public_leave_submission.sql
```

Every verifier row should return `ok = true`.

## Local validation

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Manual checklist:

1. Open normal `http://localhost:3000/` — no special query route is required.
2. Select a teacher in the normal E-Jadwal header/dashboard.
3. Open **Ajukan Izin**.
4. Confirm the same teacher is prefilled.
5. Change the form teacher and return to Dashboard; the global last-viewed teacher must remain unchanged.
6. Select a date and verify the impacted JP list follows effective schedule/incidental/calendar behavior.
7. Submit one harmless request.
8. Confirm a request code appears and the database row remains `SUBMITTED` only.

## Next checkpoint

V3.12.1 will consume `leave_request_slots` for Wakakur review:

```text
SUBMITTED
 -> APPROVE / DECLINE
 -> APPROVED slots materialize as WAITING coverage_slots
 -> Waiting List Badal
```

That administrative write path must remain privileged even though teacher submission is open.
