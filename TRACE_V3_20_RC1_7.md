# TRACE ON • E-Jadwal V3.20 RC1.7 — Staging Candidate

Baseline: uploaded RC1.6.1 PERSONAL. New source distribution is **shareable only** (no `.env.local`). No production migration or live PostgreSQL execution performed in this environment.

## Scope and source of truth

1. **Correct izin reason with audit**: Approved leave `leave_requests.reason/detail` is canonical. `ejadwal_correct_leave_reason_rc17` updates its active `LEAVE_WORKFLOW` `coverage_slots.reason_snapshot` in the *same transaction*; append audit with before/after and operator note. Manual inval has no parent leave request; `coverage_slots.reason_snapshot` is canonical, edited in `Log Izin & WA` by `ejadwal_correct_manual_inval_reason_rc17`. Never infer or rewrite historical reasons automatically. Existing classification correction remains independent and audited.
2. **Manual inval category**: new compulsory `PERSONAL` or `SCHOOL_DUTY` selector on `Input Inval (Admin)`; official duty auto-selects `SCHOOL_DUTY`. Supabase `ejadwal_save_inval_bundle_rc17` wraps the existing subject + badal + task writer; adds category to returned `ADMIN_MANUAL` slots in same transaction, and logs audit. Existing leave-workflow category remains owned by original leave request. Stats consume stored category (no guessing from reason text).
3. **Management task editing**: edit `leave_request_tasks` for approved requests and JP1–6, with optimistic stale-edit check, audit and reason note. Existing database trigger `trg_leave_request_tasks_sync_coverage` propagates edited text to `learning_tasks` for active coverage rows, which are what substitute/guest workflows read. Structured Drive/link resources are **not deleted or edited** by this release. JP0 has no teacher-owned task.
4. **Room event reservation**: new staff-only `room_event_reservations` and admin page `Reservasi Ruangan Event` with form/date/week calendar, reservation editing/cancellation, conflict previews and atomic save. Server conflict checker includes bookings, active weekly master slots (with dated room/time overrides), additional dated lesson slots and `room_unavailability`. Time intervals are half-open `[start,end)`, so a meeting ending at 10:00 and one starting at 10:00 do not conflict. Uses explicit school-local times for JP0..6 fallback; special schedule times take precedence.

## Important limitations / known gaps

- **Do not deploy without a staging check**. SQL was statically inspected, not executed on PostgreSQL; no real live user session tested.
- New reservation prevents conflicts **at reservation write time**. A future change in schedule master/incidentals/room unavailability does **not yet enforce** booking collision across their independent writers; managers must check the event calendar after schedule changes. A comprehensive trigger-based global invariant is future work.
- SQL conflict check conservatively includes weekly master even on dates suppressed by some academic calendar rules, to avoid false-free room claims. The UI uses effective operational calendar and may show fewer lessons than server. The server is authoritative.
- Event calendar and booking list are in the **new admin page**, not yet overlaid onto the existing public `Jadwal Ruangan` view; the database is the authoritative source for events.
- Event start/end must be within one day. Recurring/multi-day events and bulk room reservations are not included.
- Teacher tasks updated by management cover **description text**. Structured Drive files remain teacher-owned; replacing a Drive file requires a separate file workflow. Links typed into descriptions appear as text/links but are not auto-managed as structured resources by task editing RPC.
- The default category on the manual UI is PERSONAL; operator must explicitly review before saving. Approved Waiting List follows its own request classification and assignment writer.
- Source baseline included a mistakenly located RC1.6.1 read-only verifier in `migrations`; this release moves it under `verifiers` in the shareable distribution (do not execute it as a migration).

## Staging installation

1. Create full database backup, record RC1.6.1 schema version and snapshot and test with a non-production Supabase project.
2. Run `202610300001_v3_20_rc1_7_leave_task_inval.sql`, then `202610300002_v3_20_rc1_7_room_event_reservations.sql` in that order.
3. Execute read-only `supabase/verifiers/202610300003_v3_20_rc1_7_readonly.sql`; every feature result should be `true`, RLS enabled and direct inserts denied. Do not attempt an unverified automatic migration.
4. Overlay full source or patch, restore **your own local** `.env.local` outside of the archive, and run `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd run test:320`, `npx.cmd tsx --test src/__tests__/v3-20-rc1-7-release-contract.test.ts`, `npm.cmd run build`.
5. UAT: (a) correct leave reason and compare leave request + assigned/unassigned coverage + audit; (b) save one manual PERSONAL and one SCHOOL_DUTY inval, compare category analytics; (c) edit task JP with two classes, ensure both substitute tasks show updated text, and test stale edit denial; (d) book an empty room, book an overlapping event (must fail), try master + incidental collision, edit/cancel, and verify audit.
6. Do not publish until role/RLS and guest task read checks are completed. Do **not** migrate archived data just to fill categories; historical UNKNOWN stays UNKNOWN.

## Test evidence

- TS/TSX transpilation syntax scan: performed; see delivery summary.
- `npm ci`: failed in this runtime due to no internet and missing npm cache (`EAI_AGAIN`/`ENOTCACHED`); thus **lint, test, full build and SQL execution remain UNVERIFIED** here.
