# E-Jadwal V3.14.6 RC3.4.9.4 — Individual Leave Patterns

Base: RC3.4.9.3. New migration: `202610120008_v3_14_6_teacher_leave_patterns.sql` (run **after 007**).

## What changed
- Statistics split teaching absence JP1–JP6 from JP0 and free; total absence = all three, per teacher+date+period deduplicated.
- Teaching ratio: comparable absent teaching JP divided by effective scheduled teaching JP; no JP0 or free in denominator.
- Operational ratio shown **as an estimate**: eligible absent slots divided by nominal required school presence Mon–Thu JP1–6, Fri JP1–3, plus JP0 for homeroom teachers, excluding school-wide holidays where recorded. Not a time-clock record. UI names this an estimate.
- Filtered heatmap `All / Full day / Partial / Unknown` uses identical per-slot opportunity denominators. SQL v2 returns stored `leave_requests.request_type` for approved entries; legacy entries lacking a request link are UNKNOWN rather than guessed.
- Per-date/JP chronology with weekday filter and a separate JP0/free column, plus optional last-30/all dates.
- A conservative exploratory list of repeated slots (>=5 opportunities and >=2 absences) is per selected mode and does NOT infer intent, fraud, health, or suitability for future leave.
- Staff-only reasons table stays private; printer-friendly internal report through browser print/Save as PDF.
- Existing WhatsApp management shortcut (`+6281325245959`) remains immediately beside required permission screenshot upload in LeaveRequestForm. It was already present in RC3.4.9.3, so no duplicate UI introduced.

## Verification and staging checklist
1. Install/upgrade SQL migration `008` in staging after migration 007, verify RPC as authenticated staff and deny anon/guest.
2. Test a FULL_DAY leave and PARTIAL leave for the same teacher across multiple weeks; old legacy entries should be UNKNOWN.
3. Test a shared/combined class and duplicate coverage records: one JP for same date+period.
4. Test a school-wide holiday removing relevant denominator JP and intentional dated replacement preserving actual teaching.
5. Test chart modes, per-date matrix, PDF print, and WhatsApp shortcut on desktop and mobile.
6. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` on Windows; do not deploy until ALL pass and SQL works in staging.

## Statistical limits
- Teaching opportunity denominators are reconstructed from the **current** schedule/calendar/incidentals, not guaranteed historical schedule snapshots. Explicit mismatches are excluded from teaching rate and flagged.
- Operational opportunity count uses a **nominal policy model**, not evidence of the teacher's actual attendance requirement on every historical date.
- Full day / partial is only known for approved leave requests with recorded request_type; historic badal records are UNKNOWN.
- Concentration of absences on a weekday/JP does not establish deliberate avoidance. Present counts, opportunities, dates and contextual reasons before any human administrative evaluation; do not auto-deny leave.
