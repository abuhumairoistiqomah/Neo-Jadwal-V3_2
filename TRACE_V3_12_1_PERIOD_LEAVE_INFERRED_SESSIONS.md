# TRACE V3.12.1 — Period-Based Leave + Inferred Combined Sessions

## Scope

This checkpoint fixes two domain-model issues discovered during V3.12 field testing.

### 1. Combined teaching sessions are inferred, not dependent on one flag

A shared teaching session is inferred when different class rows have:

- same school day/date
- same JP
- same clock time (when both rows carry explicit clock values)
- same subject
- same teacher set
- neither row is `ALTERNATING`

`kelasgabung=Ya/Iya/COMBINED` remains a useful explicit label, but is no longer the only grouping signal.

Expected example:

```text
03 MQ IKHWAN | JP1 | Al-Qur'an | WANDA WIRAYUDA | kelasgabung=Tidak
04 MQ IKHWAN | JP1 | Al-Qur'an | WANDA WIRAYUDA | kelasgabung=Ya
```

is one operator session:

```text
JP1 | 03 MQ IKHWAN + 04 MQ IKHWAN | Al-Qur'an
```

Both underlying class rows remain distinct for persistence/audit.

This inference is shared by:

- Input Inval grouping
- Jadwal Kelas conflict classification / green combined semantic
- Leave-form teaching assignment grouping

### 2. Leave is attendance-per-JP, not class-per-row

Every active school JP is represented in the open leave form.

```text
JP1 TEACHING -> leave statistic + teaching class slot(s)
JP2 FREE     -> leave statistic only
JP3 TEACHING -> leave statistic + teaching class slot(s)
JP4 FREE     -> leave statistic only
```

The active JP universe is inferred from active effective school schedules on the selected date. This naturally follows shorter school days and whole-school academic-calendar closures.

`FULL_DAY` selects every active school JP, including free periods.
`PARTIAL` allows the teacher to select any active JP.

## Persistence split

New table:

```text
leave_request_periods
  leave_request_id
  schedule_date
  period
  period_type = TEACHING | FREE
```

Existing `leave_request_slots` remains the class/coverage layer and stores only teaching assignments.

Therefore a FREE period:

- counts as teacher absence for future statistics/bonus policy
- never generates a coverage/badal slot
- never invents a dummy class

## Public security

Anonymous users still have no direct write privilege on leave tables.
The frontend uses:

```text
ejadwal_submit_public_leave_request_v2
```

Server-side validation checks active school JP, TEACHING vs FREE consistency, teacher schedule ownership for teaching slots, calendar suppression, and existing coverage via the locked V3.12 validator/RPC.

## SQL

Apply:

```text
202610080018_v3_12_1_period_leave_and_inferred_sessions.sql
202610080019_v3_12_1_verify_period_leave_and_inferred_sessions.sql
```

All verifier rows must return `ok = true`.

## Focused checks performed in build environment

- pure-domain TypeScript strict compile: PASS
- inferred combined session runtime assertion: PASS
- period-derived FREE/TEACHING runtime assertion: PASS
- payload split (`p_periods` vs teaching `p_slots`) runtime assertion: PASS
- full npm dependency install unavailable in build environment (registry install timeout); run the full suite locally before lock

## Manual smoke test

1. Use a teacher who has two same-JP/same-subject/same-teacher classes where only one row says combined.
2. Confirm Jadwal Kelas does not show one side as conflict and both sides get combined semantics.
3. Input Inval should generate one operator row with both class names.
4. Open Ajukan Izin. Confirm every active JP appears, including free periods.
5. Submit a partial leave containing one TEACHING and one FREE JP.
6. In Supabase verify:
   - one `leave_request`
   - two `leave_request_periods`
   - class rows exist in `leave_request_slots` only for the TEACHING JP
7. Confirm a free JP never appears as a badal row.
