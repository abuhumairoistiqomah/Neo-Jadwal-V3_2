# V3.14.6 RC3.1 — Mass Syaikh Publish Diagnostics (RC3 Add-on)

Target: unblock and explain failure when rotation preview is valid (zero warnings/errors) but Supabase publication is rejected.

## Findings

- Preview validates planned batch only; it does not execute Supabase's full effective teacher/room checks.
- Rotation SQL `ejadwal_publish_syaikh_rotation_v1` calls the dated upsert *sequentially* for each row with a NULL room ID (inherit from master). The canonical upsert's shared-session check requires `p_room_id IS NOT NULL`; therefore it can treat valid combined classes as teacher conflicts, including while sibling rows have not yet been committed.
- Other possible server blockers: RPC not migrated (`PGRST202`), an incidental already owned by a different type, genuine teacher clashes, backend permission or migration mismatch. The exact error message is necessary to distinguish.
- Before this hotfix the error appeared only at top of a long preview screen, frequently off-screen after pressing Publish.

## Behavior

- On server `TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED` after preview with zero warnings, explicitly ask the ADMIN whether to override it for the **entire atomic batch**, then retry only with consent. This does **not** silently relax backend safety, nor does it bypass authorization.
- If admin declines confirmation, no batch is written.
- Decode Supabase error message/code, show specific migration hint for missing RPC, and resolve class IDs to names for occupied incidental slots.
- Duplicate result banner beside the Publish button for visibility.
- NO SQL changes in RC3.1; existing RC1→RC2→RC3 migrations are unchanged.

## Limitations

- This is a diagnostic and manual-confirmation hotfix, **not** a permanent backend solution for falsely detected group conflicts. Further DB-side batch-aware validation is appropriate if the live error confirms it.
- Atomicity depends on the existing SQL function transaction semantics.
- Do not deploy RC3.1 directly to production until local build, tests, and staging Supabase publish smoke tests pass.

## Staging validation

1. Copy RC3.1 overlay onto RC3 and run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
2. On staging preview the 27-row Syaikh rotation and press Publish.
3. If prompted for teacher conflicts, investigate combined vs truly distinct sessions; confirm only after checking expected schedule/venue.
4. If error persists, report full message/code displayed beside publish; do not loosen all constraints globally.
5. Verify publish idempotence and effective schedules in Jadwal Kelas, Guru, Ruangan, Conflict Center.
