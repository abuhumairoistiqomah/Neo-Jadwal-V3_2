# E-JADWAL V3.20 RC1.5 — Dashboard Team Teaching + Salin Jadwal Insidental

**Baseline:** V3.20 RC1.4.1 (the TypeScript hotfix of RC1.4). Apply only to that baseline.

## 1 — Why Andika appeared on Tsaqif's dashboard

The canonical dated timetable correctly tracks `scheduledTeachers`, `absentTeachers`, `substituteTeachers` and `effectiveTeachers`. However, the Dashboard's *Team Teaching* badges still enumerated raw `guru1..guru6` — the master team. For a leave affecting 04 INTER 2 I, JP1, this resurrected Andika on Tsaqif's card despite the leave and Rafi's substitute coverage.

RC1.5 displays `effectiveTeachers`, excluding the currently selected teacher, and keeps the existing logic for **separate temporary transferred-assistant duties**. The weekly master, leave, and coverage records are untouched.

## 2 — Copy dated incidental lessons to multiple classes

Open **Jadwal Insidental → Salin Jadwal Insidental ke Beberapa Kelas**:

1. Choose the concrete date and an existing **source class** which has incidental rows on that date.
2. Choose one or several periods (JP1–JP6), e.g. JP4 and JP5 for TKA.
3. Choose as many destination classes as necessary, e.g. 12 AE 2 and each intended 12 MQ group.
4. Review every target class × JP preview. Default: existing destination incidentals are **blocked**, not silently overwritten.
5. If a destination has an existing weekly master lesson, it retains its **own teaching team and room**. Only the dated incidental subject and source special-note are copied. Choose time copying if appropriate.
6. If the destination has no master lesson/dated incidental at that JP (common for Friday afternoon), explicitly tick **copy team to empty slots**. This duplicates the source teaching team (which might be the intentional `Guru belum ditentukan` placeholder); no room is cloned. It can create parallel assignments for real teachers: review Conflict Center after copying.
7. Confirm and save. All destinations and periods are committed/rolled back together in `ejadwal_copy_incidental_lessons_v320_rc15`.

**Scope:** date-specific only. It does not create a repeating every-Friday schedule, does not edit `schedule_master`, and does not copy teacher leave/coverage rows.

**Safety:** only ADMIN/WAKASEK; database checks approved coverage conflicts, source existence, class IDs and periods, duplicates, transaction advisory locks; one audit row per copied slot sharing a request_id; no teacher-room copying on already occupied destination slots. An active badal blocks copying. Source teacher team duplication in empty slots requires explicit opt-in.

## 3 — Deployment

1. Backup database and source. Apply `supabase/migrations/202610230004_v3_20_rc1_5_dashboard_team_copy_incidental.sql` in **staging Supabase**.
2. Run `supabase/verifiers/202610230004_v3_20_rc1_5_readonly.sql` (read-only; expects `copy_rpc_exists = true`).
3. Overlay RC1.5 patch onto RC1.4.1 source root (directory containing `package.json`). Patch **does not contain `.env.local` or `package-lock.json`**.
4. Run `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`, `npm.cmd run dev` in Windows PowerShell.
5. In the teacher dashboard for 2026-10-23, view Tsaqif on 04 INTER 2 I / JP1. Andika should not appear as an available teammate; Rafi should appear if the active replacement log is loaded. Check Andika and Rafi dashboards separately.
6. In Jadwal Insidental, preview TKA copying JP4–JP5 from the already configured source grade 12 class to a suitable grade 12 destination, then confirm and verify Jadwal Kelas and Jadwal Guru without changing any master row.

## 4 — Verification status

Focused new regression **7/7 PASS**. A limited domain regression harness had **39 passing tests**; full `npm ci`/`tsc`/Vite build and PostgreSQL migration were **not** run in this environment because npm's offline dependency cache lacks `@supabase/supabase-js`. Test and migrate in staging before using production.
