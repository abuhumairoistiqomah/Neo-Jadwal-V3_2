# TRACE V3.14.2.1 — Inval Normal-Teaching Block Hotfix

## Root cause
`InputGuruPengganti` already contained `resolveNormalTeachingBlock(...)`, but the main sidebar route in `App.tsx` did not pass `substituteConstraints`. The Supabase cutover preview did pass them, which hid the wiring gap during focused development.

## Fix
- Root App keeps active `substituteConstraints` in state.
- Supabase refresh/login restores schedule snapshot and constraints together.
- Main `InputGuruPengganti` receives those constraints.
- Saving/toggling a restriction refreshes the root constraint cache immediately.
- `blocks_normal_teaching` changes an actual teaching/homeroom/companion duty to `× Izin (kelas) • reason`.
- FREE periods remain `× Free` because they do not create a class-coverage obligation.

## Database
No new migration. Requires the V3.14.2 migration that added `blocks_normal_teaching` to already be applied.
