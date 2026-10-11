# TRACE V3.10 — Input Inval Consumer Cutover

## Goal

Prove that Input Inval can read the migrated Supabase snapshot without losing any consumer-visible legacy data, then activate the already-designed gender preference + substitute-constraint policy in a read-only shadow preview.

## Gate

Open:

```text
?supabase-inval=1
```

Login using Supabase Auth with role `ADMIN` or `WAKASEK`, then run **Load + Compare**.

Expected parity cards:

```text
TEACHERS              MATCH
SCHEDULES             MATCH
LOGS                  MATCH
JADWALINSIDENTAL      MATCH
MASTERRUANGAN         MATCH
KALENDERAKADEMIK      MATCH

INPUT INVAL PARITY PASS
```

Counts may move with staging data; `MATCH` is the gate.

## Manual recommendation checks

1. Select a date and an absent teacher with multiple JP.
2. Generate replacement rows.
3. Verify candidates already teaching the JP remain in the legacy busy/override group.
4. Verify teachers on leave remain unselectable.
5. Verify same-gender candidates rank ahead of different-gender candidates when other availability gates are equal.
6. Verify unknown teacher/class gender does not hard-block anyone.
7. If a matching soft substitute constraint exists, verify the teacher appears under **Pembatasan Badal (Boleh Override)**.
8. Click the soft-constrained teacher and verify an explicit confirmation appears with the rule reason.
9. If a non-overridable rule exists, verify the teacher cannot be selected.
10. Verify daily and weekly load cards still show base/calendar/izin/badal/projected values.
11. Verify an incidental row with only one teacher override inherits the other teacher positions from master rather than clearing them.
12. Verify the final save button says **Write Dikunci di Shadow Mode** and cannot persist data.

## Policy order

The recommendation list now uses this conceptual order:

```text
hard availability/conflict
→ substitute constraint status
→ class/teacher gender preference
→ subject / subject-cluster / level fit
→ daily load
→ weekly load
→ existing special preferences
```

Gender is intentionally not a prohibition. Soft substitute constraints are intentionally overridable.

## Persistence boundary

V3.10 does not create/update `coverage_slots`, `learning_tasks`, `task_resources`, or `coverage_constraint_overrides` from the shadow form. That write path is the next explicit checkpoint.
