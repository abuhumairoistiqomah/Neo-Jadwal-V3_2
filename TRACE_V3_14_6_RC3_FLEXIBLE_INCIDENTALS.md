# TRACE V3.14.6 RC3 — Flexible Incidental Input, Nonblocking Room Collision

**Base:** V3.14.6 RC2. **Status:** Release Candidate for staging; not yet validated on real Supabase/Postgres or via Windows `npm.cmd run build`.

## Operational decision

An incidental is first a **dated override of class + date + JP**. It does not need to match the master's subject. Staff should be able to record the event, see a dated room collision in Jadwal Ruangan / Conflict Center, and fix the offending room through the weekly/date-specific room editor **afterward**. A room collision is an operational BLOCKER in the dashboard, **not** a hard rejection by the incidental database writer.

## RC3 changes

1. `src/components/IncidentalScheduleAdmin.tsx` auto-selects `OVERRIDE` if a master exists for the selected class + weekday + JP; otherwise `ADDITIONAL`. Removes the manual mode switch. Provides a nonblocking room-occupancy preview where recognizable, and reports how to resolve it after saving. Does not compare master `mapel` with the new activity.
2. **NEW additive migration** `supabase/migrations/202610110003_v3_14_6_incidental_conflicts_nonblocking.sql`: replaces `ejadwal_upsert_schedule_incidental_v1` body with the RC2 logic plus these changes:
   - Infer `v_kind` from the active master slot (class + ISO weekday + JP), independently of requested `p_kind` or `p_subject`.
   - Detect room collisions but **never raise `ROOM_SLOT_CONFLICT`** from the incidental upsert; record `'room_conflict_warning'` in `audit_logs` instead.
   - Retain one active incidental per class + date + JP, teacher-conflict confirmation, valid teacher and room IDs, staff authentication, audit logs, transaction advisory lock, and master immutability. No change to permanent schedule master editor's strict validations.
3. `src/domain/schedule/effectiveSchedule.ts`, `src/domain/models.ts`, `src/infrastructure/repositories/supabaseScheduleMappers.ts`: a Supabase incidental with an explicit teacher SET list replaces the **whole** teacher team. Unused teacher positions no longer falsely inherit teachers from master. Room-only dated modifications without teacher SET list still inherit original teachers. Legacy incidental fixtures without explicit `replaceTeachers` continue their prior field-wise fallback.
4. Domain Conflict Center and Jadwal Ruangan classification are **unchanged**: distinct dated activities sharing a room still show conflicts in red. Weekly room relocation still requires an available destination, so accidental moves into another occupied room cannot cascade conflicts.
5. `src/__tests__/v3-14-6-rc3-operational-incidental-flexibility.test.ts`: 6 new tests for conflict visibility, strict master immutability, different subject override, audit SQL, automatic mode, and explicit-teacher replacement.

## Migration / deployment sequence

If not yet applied, stage RC1 then RC2 then RC3, **in order**:

```text
supabase/migrations/202610110001_v3_14_6_weekly_room_editor.sql
supabase/migrations/202610110002_v3_14_6_incidental_combined_sessions.sql
supabase/migrations/202610110003_v3_14_6_incidental_conflicts_nonblocking.sql
```

If RC1 and RC2 are already installed, apply **only RC3**. The GitHub/Vercel deployment does not automatically execute these migrations. Test in a **staging Supabase project** first. Save/back up the current function definition before applying on production. Do not push to Vercel `main` until the SQL and app smoke tests pass.

## Manual smoke matrix

- Date **12 Oct 2026**, `12 AE 3 A`, JP1 (master Math) → incidental `Gladi Resik TKA` / RSG. Verify *Math is replaced*, not duplicated, on that date, while weekly master remains Math.
- Same date JP1, `12 MQ AKHWAT`, override master Al-Qur'an → `Latihan Khusus` / RSG with different teacher. Save must succeed (unless genuine teacher conflict still requires explicit confirmation). Jadwal Ruangan must show red conflict for RSG JP1.
- From Jadwal Ruangan edit the `12 MQ AKHWAT` session to an **available** room; verify red conflict disappears, both dated schedules remain correct and original master unchanged.
- Ensure a single class cannot receive two incidentals for the same date + JP; edit existing row instead.
- A normal teacher change with one selected replacement must not re-add the old second master teacher. Conversely, a room-only relocation must retain the full original teacher team.
- Confirm unrelated teacher double-booking still warns/asks confirmation (room collision itself does not block).
- Check Monday through Thursday dates separately: the editor remains date-scoped, NOT a multi-day batch editor.

## Validation in this environment

- 150 TS/TSX files syntax-parsed with TypeScript transpiler (0 syntax diagnostics).
- Alternative offline test run: 258 passing tests, 2 test files could not load because `react` and `@supabase/supabase-js` packages are unavailable; **not assertion failures**.
- 6 new RC3 tests passed in targeted run; RC2 and existing effectiveSchedule tests also passed.
- **Not verified:** SQL applied to Postgres, npm ci, TypeScript full typecheck (`npm run lint`), Vite build, browser e2e. Confirm on local Windows and staging Supabase before production.
