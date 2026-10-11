# E-Jadwal V3.14.6 RC3.2 — Dated Incidental Slot Ownership

**Base:** RC3.1 Syaikh Publish Diagnostics. RC3.1 changes are preserved.

## Reported production symptom

In Dashboard → Wali Kelas → 12 MQ AKHWAT → Monday 12 Oct 2026 JP1, a new incidental for Gladi Resik still displayed original **Ekonomi** and old teachers; 12 AE's original subject was Fisika. This is a read-model/merge bug when the dated incidental belongs to a combined class label, not permission to show two sessions.

## Root cause and correction

1. Dashboard had its own merge logic, including a strict string equality test for incidental class vs master class. Combined labels were not matched, then the UI unioned original and incidental teacher arrays.
2. Dashboard now uses `buildDashboardEffectiveDay` over the canonical `buildEffectiveScheduleForDate`. The class+date+JP effective occupant is taken as authoritative; the UI no longer unions raw incidental and raw master names.
3. The canonical engine preserves each concrete master class ID/label when an incidental targets several classes. It collapses duplicate overridden master rows for the same class and JP.
4. For a Supabase-explicit teacher SET team, old teacher slots stay cleared. Stale leave/badal logs for the displaced teacher no longer contaminate the effective team. Room-only changes still inherit subjects/teachers, while regular master records remain untouched.
5. Class matching now accepts `+` as an additional combined-class delimiter (and existing `&`).

## Test matrix / browser smoke

1. In staging, select `12 AE 3 A` and Monday `2026-10-12`, JP1. With the new incidental saved with subject `Gladi Resik TKA`, only **Gladi Resik TKA / the assigned supervisors** should display; old Fisika and its teachers must not.
2. Select `12 MQ AKHWAT` for the same date/JP. Old Ekonomi and its teachers must not appear, and the same combined incidental should display with the same supervisors.
3. Try a date without an incidental. The normal master must display unchanged.
4. Try a pure room relocation. Subject and teachers must remain unchanged, only room changes.
5. Inspect Jadwal Kelas → Minggu Ini and Jadwal Ruangan: same effective session. Check that Konflik Ruangan remains visible where appropriate.
6. Re-test Mass Import Syaikh Publish from RC3.1; this change does not alter its RPC or SQL migrations.

**Caveat:** The frontend cannot reconstruct missing data. If a saved incidental has empty `override_subject` or no explicit teacher override rows in Supabase, the canonical engine intentionally inherits the corresponding master fields. Verify the stored incidental subject and supervisor assignments if the old fields still appear.

## Release gate

On Windows, from the full RC3.2 project root:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Staging first. Do not push the unverified RC to Vercel production.

**SQL:** No new migration for RC3.2. If staging has not yet applied RC1–RC3, apply the three existing files `202610110001`, `202610110002`, and `202610110003` in order. No changes to GAS or environment variables.
