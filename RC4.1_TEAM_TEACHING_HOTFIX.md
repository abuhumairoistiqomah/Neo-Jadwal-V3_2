# E-JADWAL V3.19 RC4.1 — Emergency Hotfix: Tidak Perlu Badal (Team Teaching)

Baseline: V3.19 RC4. Scope: **Aturan Guru Badal → Tentukan Badal → Tugas Resmi Sekolah** ONLY. Existing regular Inval/approved-leave substitute workflows do not receive this shortcut.

## Problem
A teacher (e.g. Ustadz Aria) is absent from one or more instructional slots because of official school duty. The original smart substitute modal forces staff to select an additional named teacher even where remaining team-teachers will continue to supervise/teach the class.

## Changes
- Add option **✓ Tidak perlu ada badal — Ditangani team teaching yang tersedia** at the top of the official-duty teacher picker for JP1–JP6 (never JP0/homeroom).
- Explicit confirmation before choosing.
- The server saves canonical `coverage_slots.status = 'NO_SUBSTITUTE'`, `substitute_teacher_id = NULL`, and no fabricated substitute snapshot. `source = 'OFFICIAL_DUTY'`, original absent teacher/slot are preserved; NO leave request is created.
- Admin/WAKASEK-only audited Supabase RPC; original normal assigned-substitute RPC remains unchanged.
- Server checks that the original teacher is actually assigned, active KBM isn't cancelled by the calendar, and at least one **other active teacher on the same effective class/JP team** is available (not on approved leave, duty/compensatory off, or normal-teaching restriction). This is a planned-availability check, **not proof of physical attendance**.
- Coverage counter regards `NO_SUBSTITUTE` as resolved without increasing any teacher's `JP Badal`.
- Completed team-teaching slots appear as such in the official-duty modal. **Batalkan keputusan** reopens a slot for a different choice, with audit history intact.
- No changes to existing class schedule, public teacher identity, statistics calculation, or official duty rules themselves.

## Installation
1. Back up the project and Supabase database. Test on **staging first**.
2. In Supabase SQL Editor run: `supabase/migrations/202610210001_v3_19_rc4_1_team_teaching_no_badal.sql`.
3. Extract `e-jadwal-v3.19-RC4-to-RC4.1-team-teaching-hotfix.zip` over your **V3.19 RC4** project root (`e-jadwal-v3.19`), preserving its structure. This patch does NOT include `.env.local` or `package-lock.json`.
4. Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev`. Dependency reinstall is not needed (package manifest unchanged).
5. Open **Aturan Guru Badal → Tentukan Badal → Tugas Resmi Sekolah**, select the class JP and choose **Tidak perlu ada badal**. Confirm. You can mix this with real named substitutes for other JP.
6. Verify the slot shows **Ditangani Team Teaching** and no longer appears as pending. Check that Log Badal and JP Badal do NOT credit any fake teacher.
7. Click **Batalkan keputusan** if a slot requires an additional substitute after all.

## Known limits
- A slot is only accepted if another **effective team teacher** is found and passes the server's recorded-availability checks. A solo-teacher JP cannot use this shortcut. JP0 requires normal substitute treatment.
- Later changes to a teammate's schedule, leave, or duty are not continuously revalidated by this hotfix. Management should revisit the decision if the team changes; wider automatic reconciliation belongs in a subsequent RC.
- Official-duty batch saves remain sequential, like RC4. A mid-batch failure can leave earlier slots saved. The UI refreshes progress; do not assume the entire batch is atomic.
- SQL execution and full npm lint/test/build could not be verified against the user's live Supabase or Windows setup from this environment. Treat as **staging candidate** until confirmed locally.
- `.env.local` is included ONLY in the PERSONAL full source zip, not in the patch or shareable zip. The PERSONAL zip contains sensitive keys; do not distribute or commit it.

## Rollback
- Use **Batalkan keputusan** to reopen any `NO_SUBSTITUTE` slot. Then reassign an actual badal if necessary.
- To revert frontend, restore the previous RC4 source backup. Do not delete `coverage_slots` records manually.
