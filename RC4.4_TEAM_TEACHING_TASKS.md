# E-JADWAL V3.19 RC4.4 — Tugas untuk Team Teaching

Baseline: **RC4.3**. RC4.4 reuses **existing `learning_tasks` / `task_resources`** and the existing task modal/button. It does not create a fake substitute teacher, a new task table, a new teaching JP, or a physical attendance record.

## Behaviors

- `NO_SUBSTITUTE` explicitly acknowledged by the new workflow is visible in the **remaining co-teachers' Dashboard Guru**, on their **existing** regular class/JP cards. Each relevant decision has a task button if the task text exists, otherwise a conspicuous **Tugas belum tercatat** message.
- It is limited to the **exact date + class + JP**. The absent teacher, unrelated teachers, and anyone unavailable/cancelled for that session do not get a task on their regular-teaching card. Old `LEGACY_IMPORT` blank-substitute records are *not* automatically trusted as verified team teaching.
- Dashboard Wali Kelas identifies `NO_SUBSTITUTE` as **Ditangani Team Teaching**, rather than **Pengganti belum ditentukan**; any saved task retains the standard **Lihat Kegiatan Siswa / Tugas** button.
- In **Input Guru Pengganti**, `NO_SUBSTITUTE` persists the *already-existing* task text and link/Drive metadata in the same database transaction as the decision. If an approved teacher request already supplied a task, the original teacher-owned task is retained, not overwritten by the operator.
- In **Aturan Guru Badal → Tugas Resmi Sekolah**, the existing Task / Link Materi editor appears when **Tidak perlu ada badal** is selected. Its existing text/resource metadata are saved transactionally with the official-duty acknowledgement.
- RC4.3 soft-delete/cancellation continues hiding both cancelled coverage and its attached tasks. Existing **assigned-badal** behavior is unchanged.

## Install

1. Back up database and test in **Supabase staging** first. Ensure migrations through RC4.3 are already applied.
2. Apply `supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks.sql` in SQL Editor.
3. Execute `supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks_verify.sql` to check installation and show a non-sensitive aggregate by source.
4. Extract RC4.4 patch over the RC4.3 project (or use Full Source Personal). Existing `.env.local` and `package-lock.json` must remain untouched when using the patch.
5. In Windows PowerShell: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dev`.

## Acceptance tests

1. Create an Al-Qur'an NO_SUBSTITUTE decision for a class where another co-teacher is genuinely available; add a task and a material URL in the existing task field. Refresh app snapshot. The remaining teacher sees the task on their ordinary class/JP, and the task can open with the existing modal.
2. The absent teacher, a teacher outside that class, a teacher who is independently absent, and a cancelled lesson **must not** receive the task as active team teaching.
3. Confirm the class dashboard displays **Ditangani Team Teaching** and never says **Pengganti belum ditentukan** for a verified NO_SUBSTITUTE decision.
4. From Aturan Guru Badal → Tugas Resmi Sekolah choose NO_SUBSTITUTE, enter task, save, refresh, and inspect the remaining teacher's Dashboard Guru.
5. For approved leave containing teacher-owned tasks, select NO_SUBSTITUTE; the original assignment and resources must be preserved.
6. Soft-delete or deactivate an official-duty restriction; linked coverage and tasks must disappear from active dashboards, without deleting independent replacements.
7. Try to choose NO_SUBSTITUTE with no available co-teacher; the existing server-side refusal should remain unchanged.

## Release status

Source changes parsed and dedicated local tests passed. Full TypeScript/Vite build, external Supabase migration and browser tests **must still be run on the user's machine/staging**. Do not publish the hotfix directly to production without validating the database migration and actual dashboard visibility.

## Security

Full Source Personal contains the user's `.env.local`, so **never upload/share it**. Patch and Shareable must contain no `.env.local` or real keys. `.gitignore` protects Git staging, **not** ZIP contents.
