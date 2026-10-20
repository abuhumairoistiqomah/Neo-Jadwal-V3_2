# E-JADWAL V3.19 RC1 — Calendar Foundation

Release status: **STAGING CANDIDATE**. Built on V3.18 RC2. Not yet a full V3.19 implementation.

## Implemented in RC1
- ADMIN/WAKASEK-only **Kalender Operasional KBM** menu, separate from educational reminders/calendar.
- Semester operational date metadata, Mon–Fri default, stored with Supabase RLS (`ejadwal_operational_terms`).
- Preloaded RPH 2026 nonregular teaching suggestions. Explicit REVIEW for ambiguous dates and all post-KBM activities.
- Import from XLSX, XLS, CSV: **date + remarks only**; do NOT infer global KBM from 7 columns containing v/X. Fail closed: imported remarks always REVIEW.
- Preview/edit date range, scope ALL/IKHWAN/AKHWAT/specific class, JP0–JP6 or full day, and active/skip/review status.
- Publish only marked `NO_KBM` events, after explicit confirmation, using the pre-existing `ejadwal_save_academic_event_group_v2` RPC. This means effective-schedule behavior remains owned by **academic_events**, not a new duplicate calendar engine.
- Check active event duplicates by date, name, scope and JP; scoped events block publishing if matching class IDs cannot be found. No automatic teacher-day-off assumptions.

## Installation / validation
1. Back up your Supabase database and source. Use a STAGING project first.
2. Run **`supabase/migrations/202610200001_v3_19_rc1_operational_term.sql`** once in the Supabase SQL editor. Do not run in production until staging passes.
3. Extract Full Source Personal, or apply Patch to V3.18 RC2. The personal ZIP includes `.env.local`; the shareable ZIP and patch NEVER include it.
4. `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run dev`.
5. Login through Supabase as ADMIN/WAKASEK, open Kalender Operasional KBM. Save semester 20/07/2026–01/12/2026.
6. Load RPH 2026 template, verify class scoping (particularly Field Trip), select a harmless test exception on staging, publish, and verify it appears in Kalender Akademik and effective schedule. Test duplicate protection and error recovery.
7. Run date-specific regression checks for teacher leave, badal, management analytics; test public view still works.

## Critical semantic limitations
- Semester start/end is **PLANNING metadata only** in RC1. Dates after 01/12/2026 are **NOT** globally blocked by this term yet. Legacy SQL analytics and resolver continue to operate as V3.18 until later RC integrations; never present semester metadata as enforced closure.
- Active `academic_events` still blocks the relevant regular KBM and could affect operational statistics. Importing/publishing historical events into a live database can legitimately change effective schedule and statistics; **preview and database backup first**.
- RPH suggestions are *not* evidence that a specific teacher participated in Field Trip or deserves compensatory time off; those require named teacher ID and later duty assignment RC.
- Field Trip on 21/09 Ikhwan and 22/09 Akhwat is class-scoped. 22/09 Ikhwan and 23/09 Akhwat compensatory teacher off days are NOT generated as calendar closure.
- V3.19 RC1 does NOT implement teacher participation, compensatory leave, badal guard, teacher-day duty logs, individual analytics reconciliation, or real attendance.
- Nonteaching activity ≠ teaching JP. A partial teacher leave day can contribute BOTH a teaching day and leave day, with JP counts kept separate; this design is reserved for V3.19 later RC.
- Publishing a batch is per event, not a cross-event atomic transaction; a failure may leave earlier entries published. The UI stops, refreshes existing events, and avoids exact duplicate replay. Always check active rows after a partial failure.

## Tests completed here
- 6/6 targeted domain/UI contract checks via local TypeScript transpilation and Node native test runner.
- 236 TS/TSX files parsed without syntax errors using TypeScript 5.8.
- Full `npm ci` offline blocked by missing npm cache; network installation timed out in this environment. Full project lint, `npm test`, and Vite build remain **NOT VERIFIED**; do not deploy without running them locally.

## Release roadmap
- RC2: duty assignments by teacher ID, event participation, compensatory leave (and Wakakur override).
- RC3: Unified Duty Resolver / substitution guard and conflict detection.
- RC4: calendar-aware duty obligations (not physical attendance).
- RC5: individual two-layer analytics, teaching days and leave days can overlap, JP accounting exact, drill-down and audit.
- RC6: regression, migration hardening, performance, release gate.
