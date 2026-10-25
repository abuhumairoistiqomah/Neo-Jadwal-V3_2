# E-JADWAL V3.20 RC1.6.1 — Ratio Guru-Hari Izin

This release adds the director-requested rate to the **Total Guru-Hari Izin** card:
`343 (X%)` with text `X% dari N guru-hari kewajiban terjadwal (estimasi)`.

**Definition:** One teacher-day means a unique `(teacher_id, calendar date)`; six JP on one day count as one. The denominator is unique teacher-days with a scheduled master assignment on the date's active operational term, an explicit dated teacher-team override, a formal school duty assignment, or a valid recorded leave day. Approved leave and school duty are still categories of **teaching unavailability**, not claims of physical absence from work. The selected category changes the numerator; the denominator remains *all-category expected duty days* to support fair comparisons.

Important limits:
- The source has no historical employment contract/workday roster and `schedule_master` has no valid-from/to dates. This is an **estimate of documented obligations**, not a legal attendance percentage or proof of being physically on site.
- School holidays are excluded from recurring master obligations, unless a specific duty or leave establishes a work obligation. Teacher-specific compensatory days exclude recurring assignments unless the date also has recorded leave.
- If there are no configured operational term dates or some leave falls outside those dates, the percentage shows `—` with an explicit warning, instead of displaying an inaccurate percentage.
- The dummy `Guru belum ditentukan` is excluded. Duplicate JP, combined classes, and overlapping categories are deduplicated.
- The new read-only RPC enforces staff access; it does not expose private reasons or update any schedule or leave record.

## Install

1. Backup database and source RC1.6; apply `supabase/migrations/202610240002_v3_20_rc1_6_1_expected_teacher_days.sql` to **staging**, after RC1.6.
2. Run `supabase/migrations/202610240002_v3_20_rc1_6_1_readonly_verifier.sql` from SQL Editor.
3. Overlay the patch onto project root.
4. Run `npm.cmd run lint`, `npm.cmd run test:days`, `npm.cmd run build` on the local project.
5. Compare the card for ALL/PERSONAL/SCHOOL_DUTY: denominator should not change; numerator and percentage should.

The RPC was not executed against a live PostgreSQL/Supabase instance in this environment. Verify the ratio on staging before publishing to directors. If historical operational terms are missing, complete those before treating a multi-year comparison as reliable.
