# TRACE V3.14.6 RC2 — Insidental Shared Sessions

Base: V3.14.6 RC1. This is an RC for **STAGING**, not production-stable.

## Reported real case

On 12–15 Oct 2026, classes **12 AE Akhwat** and **12 MQ Akhwat** attend the SAME `Gladi Resik TKA` at JP1 in the SAME venue. The SAME invigilator must be assignable to both even though their weekly master rows have different subjects/teachers. The old stored procedure `ejadwal_upsert_schedule_incidental_v1` raises `TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED` (`P0001`) because it counts master and dated overrides independently.

## Changes

- New additive SQL migration: `supabase/migrations/202610110002_v3_14_6_incidental_combined_sessions.sql` **replaces the existing v1 function body** (retains its name/signature, existing auth checks, data validations, updates/inserts and audit logs). Existing v2 wrappers and batch import still use v1; no frontend API contract change.
- Conflict scans use **date-effective sessions**: if a class has a dated override, the override's subject, room, and teacher set takes precedence over the weekly master. Academic-calendar suppression of master lessons is respected.
- An explicit incoming **Kelas Gabung** gets an exemption *only when the other class's effective session has the same date, JP, subject, room and exact teacher set*. Existing row may have no combined flag, which permits sequential entry.
- Different subject in the same room remains a **hard room blocker**. The same teacher in a different room or different activity remains a warning requiring an explicit **teacher override confirmation**.
- Database serializes same date/JP writes with an advisory transaction lock (shared with room editor).
- Dedicated `Jadwal Insidental` editor first saves without teacher override; if the **authoritative** backend asks for confirmation, it explains the clash and only retries with override after the user's approval. It no longer relies solely on stale master-only candidate warnings.
- Dated Conflict Center now requires the same venue as well as subject and teacher team before coalescing a shared activity. Two different rooms with same teacher remain a warning.
- No changes to master schedule, RLS policies, Supabase environment variables, Code.gs or WhatsApp templates.

## Input workflow for the reported case

1. Select date (e.g. 12/10/2026), class `12 AE 3 A`, JP1, **Timpa Jadwal Normal** (if a master row exists), subject `Gladi Resik TKA`, room `RSG`, invigilator `Teacher X`. Turn **Kelas Gabung** on. Save; if the FIRST row still clashes with the OTHER class's existing master teacher booking, read/confirm the legitimate temporary assignment.
2. Repeat for `12 MQ AKHWAT`: exact same date, JP, subject, room, and invigilator, **Kelas Gabung** on. The second save should be recognized as part of that session.
3. Verify Jadwal Kelas effective-week, Jadwal Ruangan, Conflict Center, and teacher preview. Repeat for each concrete day (the default is not a multi-day copy).
4. Different room or different activity should still surface a conflict. Do not use the teacher override confirmation as a way to hide a real double booking.

## Deployment requirements

1. **Do not push to the production Vercel main branch yet.** Extract RC2 or apply the RC1→RC2 patch in a staging checkout.
2. Run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` locally.
3. Apply RC1 migration `202610110001_v3_14_6_weekly_room_editor.sql` if not already applied. **Then** run RC2 migration `202610110002_v3_14_6_incidental_combined_sessions.sql` on the **STAGING** Supabase database, not just GitHub/Vercel.
4. Smoke test the case above, and also a genuine room collision and genuine teacher collision. Confirm audit data and that only one concrete date changes.
5. Once passed, coordinate production SQL migration first, then production Vercel deployment. Back up the previous function definition and schema in your normal migration process.

## Verification performed here

- TS/TSX syntax parse: 149 files, no parser errors.
- 15 relevant domain/static regression tests: pass with fallback TypeScript test runner.
- Domain cases executed: same room/same invigilator => no incidental alert; different rooms => teacher warning; different subjects/same room => room blocker.
- **Not verified:** live Postgres function installation/SQL runtime; complete `npm test`, `npm run lint`, `npm run build` (npm dependency availability in this environment is limited).
