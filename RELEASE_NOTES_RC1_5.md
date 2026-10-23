# E-JADWAL V3.20 RC1.5 — Release Notes

**Baseline**: RC1.4.1 → RC1.5. **Status**: staging candidate; not yet validated on a live database or full Vite build.

## Fix A — Dashboard Guru: co-teacher on leave remains in Team Teaching

- Root cause: badges read the master teacher slots (`guru1..guru6`) rather than the dated `effectiveTeachers` produced after applying leave/badal.
- Fix: badge now uses `dashboardAvailableTeamTeachingPeers`, built from `effectiveTeachers`; absent teacher is omitted, active substitute is included. Does not alter weekly master, approved leave, or substitute logs.
- Expected case: 23 October 2026, Tsaqif's 04 INTER 2 I JP1 no longer shows Andika as an active teammate when Andika is on approved leave; Rafi appears when the substitute log has been loaded.

## Feature B — Jadwal Insidental: Salin ke Beberapa Kelas

- Source: date, source class with an existing incidental, one/many JP (JP1–JP6).
- Targets: one/many active classes; preview is class × JP; confirms before commit.
- Copied: subject, source special note (only when destination note is empty), optionally dated start/end times.
- Not copied by default: teachers/room, class-mode, badal, leave, weekly master.
- If destination already has a master, teachers and room are inherited from **destination** master.
- If destination has no master or existing incidental, operator must **explicitly opt in** to copying the source teacher team to that empty JP; room remains unspecified. Intended for TKA additional activities using the `Guru belum ditentukan` placeholder, but warns about possible real-teacher conflicts.
- Existing destination incidental: blocked by default; optional overwrite only changes subject, optional source time, and note-if-empty. **Active badal always blocks copying**.
- All or nothing: one ADMIN/WAKASEK-only RPC transaction. Audit row for each copied class × JP.
- Scope: one concrete date, NOT automatic recurrence every Friday.

## Tests & deployment

- 7/7 targeted tests passed; 39 executed domain regression tests passed under custom transpilation harness. 265 TS/TSX files parsed successfully. This does **not** replace full `tsc --noEmit` or Vite build.
- Offline `npm ci` unavailable because `@supabase/supabase-js` was not in npm's local cache. Full TypeScript checking, full app build, and PostgreSQL migration execution must be validated in staging.
- Apply `supabase/migrations/202610230004_v3_20_rc1_5_dashboard_team_copy_incidental.sql` in staging before using the UI; run the paired verifier.
- Overlay Patch on RC1.4.1. Does not overwrite `.env.local` or `package-lock.json`.
- Full Personal zip contains user's existing `.env.local`; do not distribute. Shareable zip excludes private config.
