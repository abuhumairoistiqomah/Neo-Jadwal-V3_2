# E-JADWAL V3.20 RC1.5.1 — Editable Incidental Copy Hotfix

**Base:** V3.20 RC1.5. **Sorting request aborted.** This release only corrects copying and find/edit of copied schedules.

## Root causes in RC1.5

1. The RC1.5 copy RPC only copied source teachers if the target JP had no master schedule. For master-backed target classes, the old target teachers were inherited instead.
2. New copied rows were sorted by schedule date alongside hundreds of existing incidentals, with no automatic result focus or quick copy-history filter. As a result, entries were difficult to locate for editing, even though stored as normal `schedule_incidentals` rows.
3. On edit, an older RC1.5 copied row without explicit teacher overrides did not show its inherited master teacher team correctly, making revision awkward.

## Changes

- New admin-only atomic `ejadwal_copy_incidental_lessons_v320_rc151` RPC. It copies the chosen source subject, note and optional dated time. **Copy source teacher team** is now ON by default for both master-backed and empty target slots, using editable dated teacher overrides.
- Existing target room is preserved; source room is not cloned; weekly master is not edited. No fabricated teacher or substitute. Duplicate target incidentals are blocked unless admin explicitly enables **Perbarui hasil salin**.
- New RPC returns all affected incidental IDs to the UI. After copy and refresh, the *Daftar Jadwal Insidental* auto-focuses and shows only those IDs with an Edit button on each row. The **Lihat hasil salin** filter also displays older copies including past dates.
- Old RC1.5 copy entries can be edited. If they currently inherit the target master teacher team, the editor preloads the effective inherited team instead of leaving it blank.
- An update of an existing incidental with **Perbarui** + **Salin tim guru sumber** WILL replace the target's existing team. Verify in preview and confirmation; keep room separately managed.
- Existing RC1.5 records are **not silently rewritten by migration**. Re-run copy with overwrite if you want to replace previously inherited teachers.
- Copy may put one teacher in more than one class in the same JP; review operational conflicts and edit each record separately if necessary. A placeholder teacher on the source will also be copied until replaced.

## Installation (STAGING FIRST)

1. Back up Supabase and the RC1.5 source tree.
2. Run `supabase/migrations/202610230005_v3_20_rc1_5_1_editable_incidental_copy.sql` in Supabase SQL Editor.
3. Run `supabase/verifiers/202610230005_v3_20_rc1_5_1_readonly.sql` and verify `rc151_copy_rpc_ready = true`.
4. Apply the RC1.5 → RC1.5.1 patch to the project folder. Do not overwrite `.env.local` or your repaired `package-lock.json`.
5. Run `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`.
6. In the app, go to Jadwal Insidental → Salin Jadwal Insidental, select source date/class/JP, targets, and leave **Salin tim guru sumber ke SEMUA kelas tujuan** enabled. Confirm the preview. The copied IDs will appear immediately below for individual Edit/Delete.
7. To fix copies that already exist, enable **Perbarui hasil salin / insidental tujuan yang sudah ada**, then copy again. This overwrites the target teacher team when source-team copying is selected, so review the assignments first.

## Quality gate

- Local isolated domain preview checks: 8/8 passed.
- TypeScript parser check: 267 TS/TSX source/test files, 0 syntax errors.
- Narrow TypeScript domain check: passed.
- SQL prepared and structurally reviewed; **not executed against live Supabase**.
- Full npm lint/test/build **not verified** in this environment because dependencies are not installed.

**Release classification:** staging candidate, not production verified.
