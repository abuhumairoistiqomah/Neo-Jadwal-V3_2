# TRACE V3.14.6 RC3.4.2 — Insidental History + Calendar Bulk Timeout

Baseline: V3.14.6 RC3.4.1, which itself contains all RC3.4 dated-time features.

## User-visible behavior: Jadwal Insidental

- By default, the admin list shows incidentals dated **today or later** according to **Asia/Jakarta** school local date.
- "Lihat yang sudah lewat (N)" is an unchecked checkbox beside the list title.
- Checking shows **all** loaded incidentals, including historical entries; unchecking hides historical rows again.
- The school-day boundary updates on window focus and at most one minute after midnight without reload.
- No rows are deleted, edited, or soft-deleted by the filter. Edit and Hapus are unchanged and remain available for historical entries when history is visible.
- The date is evaluated by ISO calendar day; today's incidentals remain visible until the next school day. Unknown/legacy non-ISO date formats remain visible rather than silently disappearing.

## Calendar bulk timeout (carried from RC3.4.1)

- Source and SQL migration `supabase/migrations/202610110052_v3_14_6_calendar_bulk_versioning.sql` are included.
- The frontend uses `ejadwal_save_academic_event_group_v2` and `ejadwal_set_academic_event_group_active_v2`, which write batches in a single transaction with one final schedule snapshot instead of a snapshot per row.
- This is a **candidate fix** for PostgreSQL `57014` observed on many-class Calendar entries; live SQL/runtime performance has NOT yet been confirmed.
- **Mandatory:** run SQL migration 052 on staging **before** testing the bulk Calendar flow; migration 001–004 must already exist. Do not push frontend code before applying the required database migration in the target environment.

## Windows validation

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

### Targeted smoke checks

1. With date 2026-10-11 in Jakarta: incidental 2026-10-10 hidden, 2026-10-11 visible, 2026-10-12 visible; check "Lihat yang sudah lewat" to show all three.
2. Verify Edit/Hapus on an older incidentals is available when history is expanded, then close it without changes.
3. Run Calendar Akademik on staging with 2 and then many classes; confirm no 57014, single atomic revision, correct effective schedule and historical version.
4. Force a failed revision on staging; verify no partial new group remains and old group remains active.
5. Refresh production using a known functional RC3.4 until migration 052 has passed staging validation.

No further SQL migration was added for the incidentals visibility feature.
