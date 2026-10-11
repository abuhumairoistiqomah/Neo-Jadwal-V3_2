# TRACE V3.13.4 — Schedule Mutation Core

## Goal
Unify daily schedule changes so operators can distinguish recurring master edits from one-date incidentals without creating parallel logic.

## Delivered
- Quick Edit now offers **Ubah Jadwal Tetap** vs **Hanya Tanggal Ini**.
- One-date Quick Edit writes to `schedule_incidentals`; recurring edit keeps using `schedule_master`.
- New **Jadwal Insidental** admin page for date-specific override/additional sessions.
- Incidental editor supports JP-0 through JP-6, classes, subject, room, teacher list, combined-session flag, reason, and type.
- Teacher conflicts remain confirmable warnings; room conflicts remain hard blocks.
- Incidentals are soft-deleted so audit/history is preserved.
- `ScheduleAdminRepository` is now the shared mutation gateway for mass import, permanent Quick Edit, and incidental writes.
- Effective schedule continues to apply `Master -> Incidental -> Leave/Badal -> Academic Calendar suppression`.

## Guardrail
Quick Edit one-date mode keeps the original class/day/JP identity. It is intended as an override of the clicked recurring lesson. Moving/adding a session uses the dedicated Jadwal Insidental editor, preventing the recurring lesson from accidentally remaining active alongside a moved copy.

## Database
Apply in order:
1. `202610100036_v3_13_4_schedule_mutation_core.sql`
2. `202610100037_v3_13_4_verify_schedule_mutation_core.sql`

Verifier target: **11 / 11 true**.

## Apps Script
No Code.gs change. No Apps Script redeploy or OAuth reset is required.

## Smoke tests
1. Quick Edit a recurring lesson using **Ubah Jadwal Tetap**; verify following weeks change.
2. Quick Edit the same lesson using **Hanya Tanggal Ini**; verify only that date changes on Dashboard/Leave/Badal effective schedule.
3. Add an ADDITIONAL incidental on a free class/JP via **Jadwal Insidental**.
4. Try ADDITIONAL on an occupied master slot; it must reject and ask for OVERRIDE.
5. Choose a teacher occupied in the same JP; warning + explicit confirmation is required.
6. Choose a room occupied by another class; save must be blocked.
7. Delete an incidental; it disappears operationally but remains soft-deleted/auditable in Supabase.
