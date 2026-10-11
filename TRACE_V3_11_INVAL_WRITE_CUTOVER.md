# TRACE V3.11 — Inval Write Cutover

## Goal

Move operational badal persistence to Supabase without changing the normal production-like route yet.

## Locked before write

V3.10 proved parity for:

```text
teachers
schedules
logs
jadwalInsidental
masterRuangan
kalenderAkademik
```

V3.11 requires that initial parity gate to pass before write controls are enabled.

## Atomic write contract

`ejadwal_save_inval_bundle` resolves class/teacher identities server-side, validates substitute constraints, upserts operational coverage, stores task text, optionally upserts room relocation, records constraint override evidence, and appends audit rows under one transaction/request ID.

Operational rows use `source = ADMIN_MANUAL`. Existing `LEAVE_WORKFLOW` rows can be updated if the same operational identity is already waiting/active. `LEGACY_IMPORT` remains immutable.

## Constraint enforcement

The browser passes only constraint IDs that were explicitly acknowledged in the candidate selector. The database recomputes which rules actually match the substitute/date/JP and rejects:

```text
matching hard constraint
missing soft acknowledgement
extraneous/stale acknowledgement
```

## Audit

Browser role `authenticated` has SELECT access to audit rows for staff through RLS, but not INSERT. The SECURITY DEFINER RPC performs audit writes.

Actions include:

```text
INVAL_CREATE
INVAL_UPDATE
INVAL_DELETE
CONSTRAINT_OVERRIDE_ACK
ROOM_RELOCATION_CREATE
ROOM_RELOCATION_UPDATE
```

## Staging smoke

1. Apply migration `014` and verifier `015`.
2. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
3. Start dev server and open `?supabase-inval-write=1`.
4. Login as ADMIN/WAKASEK.
5. `Load + Compare` must show `INPUT INVAL PARITY PASS`.
6. Create one harmless staging badal record.
7. Confirm the new row appears in the form snapshot and V3.11 Write Evidence.
8. Confirm an audit request ID appears.
9. Use the inspector trash button to soft-delete the staging record.
10. Refresh evidence and confirm `INVAL_DELETE` is visible.

After the first V3.11 write, Supabase is expected to diverge from the frozen Spreadsheet history. Do not rerun legacy parity and interpret that divergence as a failure; the initial parity is the cutover checkpoint.
