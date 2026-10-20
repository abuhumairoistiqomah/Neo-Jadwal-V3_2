# E-JADWAL V3.19 RC2 — Teacher Duty & Compensatory Leave

Baseline: V3.19 RC1 + RC1.1 navigation testfix + RC1.2 TSX option fix.

## Delivered
- Third tab **Penugasan Guru & Libur Pengganti** in Kalender Operasional KBM.
- Activity date range, title, area Ikhwan/Akhwat/All/Other and notes.
- Explicit teacher selection by Supabase teachers.id; no inference from which classes the teacher normally teaches.
- Teacher role: PARTICIPANT, STAFF, or REMAINS_ON_DUTY. On-duty means no compensatory off.
- Optional, per-teacher compensatory day strictly after event end. Field Trip suggestions are buttons, never auto-applied.
- Review counts, validation, cross-event overlap advisory, transaction-confirmation modal.
- Atomic save/update through authenticated ADMIN/WAKASEK-only Supabase RPC, staff RLS, audit, non-destructive CANCELLED history.
- Dedicated domain tests for input, defaults, overlaps, and security design.

## Explicitly NOT delivered in RC2
- RC3: no automatic badal availability restriction, effective schedule changes, or constraint inserts yet.
- RC4: no physical attendance/check-in/out.
- RC5: no analytics or JP/day recomputation. Recorded duties do not imply presence.
- Activity entries live in an RC2 duty event registry; RC1 academic_events remain the only live schedule suppression source. An activity is not automatically a school-wide holiday.

## Migration
Run `supabase/migrations/202610200002_v3_19_rc2_teacher_duty.sql` in Supabase staging after RC1. Migration creates `ejadwal_teacher_duty_events_v319`, `ejadwal_teacher_duty_assignments_v319` and two RPCs. It requires existing `current_user_is_staff`, `teachers`, and `ejadwal_audit_operational_rule_change`/`audit_logs` from previous versions. No data backfill or updates to leave, master schedule, or analytics.

## Manual staging checklist
1. Verify RC1 migration and current SQL roles/permissions; run RC2 migration in staging once.
2. Login authenticated ADMIN/WAKASEK; open **Kalender Operasional KBM → Penugasan Guru & Libur Pengganti**.
3. Choose Field Trip Ikhwan; add a genuine participant and set date 22/09/2026 via explicit button. Add a staff member without off, and a management teacher in 'Tetap bertugas'. Confirm management teacher's off date is disabled.
4. Save, reload page, edit a teacher and verify assignments persist. Confirm explicit warnings appear if the same teacher's comp-off overlaps another assignment event.
5. Cancel a staging event; verify active list hides it and history toggle still reveals it. Check `audit_logs` and RLS: anonymous and TEACHER cannot read private staff assignment list; TEACHER RPC must return STAFF_REQUIRED.
6. Verify Master/Class Schedule, leave, substitution and V3.18 stats unchanged.
7. On Windows run `npm.cmd install` once if npm reports out-of-sync lock from RC1, then `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.

## Packaging
- PERSONAL ZIP contains `.env.local` **and must never be uploaded to public GitHub or shared**. `.gitignore` excludes it but does not protect ZIP sharing.
- SHAREABLE ZIP and PATCH never contain `.env.local`.
- PATCH is additive to local RC1.2; does not overwrite locally repaired `package-lock.json` or `.env.local`.
- The inherited RC1 lockfile remains out-of-sync with npm dependencies in clean full sources. Registry access was unavailable in the builder environment; use `npm.cmd install` once to regenerate a valid lock locally. Full build has NOT been independently verified here.

## Validation scope
13 focused RC1+RC2 domain/source tests passed using TypeScript-transpiled Node tests. 240 TS/TSX files parsed without syntax errors. Full TypeScript semantic check, Vite build, 497+ project tests, real Supabase migrations/RLS/RPC and browser actions remain STAGING verification gates.
