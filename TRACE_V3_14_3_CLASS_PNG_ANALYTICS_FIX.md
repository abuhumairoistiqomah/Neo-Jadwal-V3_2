# TRACE V3.14.3 — Class PNG Export + Management Analytics Repair

## Scope

V3.14.3 deliberately stays small and closes two paused issues before moving image export to Jadwal Guru.

### 1. Management Analytics PostgreSQL 42803 repair

`coverage_sessions` built a `coverage_key` with this absent-teacher identity:

```sql
coalesce(cs.absent_teacher_id::text,
         lower(trim(cs.absent_teacher_name_snapshot)),
         'unknown')
```

but grouped by a different `CASE` expression. PostgreSQL therefore still saw
`absent_teacher_name_snapshot` as an ungrouped selected column and raised `42803`.
Migration `050` replaces the RPC and groups by the exact identity expression used
by the key.

### 2. Jadwal Kelas PNG export

The class timetable now downloads as lossless PNG. The existing isolated iframe
pipeline remains in place so Tailwind OKLAB/OKLCH never reaches html2canvas.
PNG export uses a higher raster target (`2.5x`, capped by a 16 MP safety ceiling)
so small timetable text and borders remain sharper than JPEG.

Teacher labels receive export-only expansion rules: line clamp and overflow are
removed, word wrapping is allowed, and timetable cells may grow vertically.
The interactive on-screen layout is unchanged.

## Database

Run in order:

1. `202610110050_v3_14_3_management_analytics_grouping_fix.sql`
2. `202610110051_v3_14_3_verify_management_analytics_png.sql`

No Apps Script redeploy is required.
