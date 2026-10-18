# TRACE V3.15.3 — Smart Approval Waiting Badal Modal

Base: V3.15.2 RC1. **No Supabase migration needed.**

## What changed

- `Persetujuan Izin > Waiting List > Proses Badal` now opens an in-page smart picker modal (same `InputGuruPengganti` engine used in Aturan Guru Badal), replacing the old new-tab handoff.
- Approved leave snapshot locks request identity: teacher, date, JP, class(es), subject, and reason; no recomputing class ownership from today's master schedule.
- Reuses gender preferences, daily / weekly workload ranking, substitute constraint warnings, and verification of teacher schedules.
- `src/domain/inval/approvedLeaveSelection.ts` validates exact one-to-one linkage to existing `LEAVE_WORKFLOW / WAITING` coverage slot IDs, including combined sessions.
- Saves via the pre-existing audited `ejadwal_replace_inval_substitute_v1` RPC: updates substitute only, does **not** create another leave request or modify teacher-owned tasks/resources.
- On multi-class sessions, updates each existing row in sequence. If a later row fails, the screen reports the number committed; refresh the waiting list to resume with still-unassigned rows. This release does not claim cross-row transaction atomicity.
- `InputGuruPengganti` remains unchanged for normal manual Inval and official-duty workflows when neither approval-scoped prop nor official-duty prop is supplied.
- Updated one old static regression which previously expected a new tab.

## Verification

- Targeted 17/17 regression tests PASS in an alternate TypeScript-to-CommonJS runner.
- Domain TypeScript check PASS.
- Full Windows `npm test`, `npm run lint`, and `npm run build` must still be run with project dependencies.
- Live Supabase RPC execution has not been verified in this environment.

## Smoke tests

1. Open approval waiting list on an approved future leave with one class; click Proses Badal. No tab should open.
2. Check auto-filled teacher, date, JP, reason, exact class and task; run Analisis Badal Pengajuan Izin.
3. Check gender, daily and weekly workload recommendations, select substitute and save.
4. Waiting item should disappear or shrink; Log Izin & WA must retain original leave + task, now with assigned substitute.
5. Repeat using multi-class combined session; verify every class has the same intended substitute and no new leave request was created.
6. Re-open stale modal from another operator and attempt write; check stale WAITING selection gets rejected by client preflight.
