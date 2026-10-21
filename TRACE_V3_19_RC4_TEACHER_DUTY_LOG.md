# TRACE V3.19 RC4 — Log Kewajiban Guru

RC4 provides a per-teacher, read-only reconciliation of planned operational duty, not physical attendance. It sources the teacher's existing approved leave RPC; all calendar, RC2 events/assignments, and effective schedule data are kept separate. A partial leave day intentionally counts toward both dated categories while preserving separate teaching/leave JP lists. Business logic lives in `src/domain/teacherDutyLogV319.ts` and the staff-access UI in `src/components/TeacherDutyLogV319Panel.tsx`.

Requires earlier RC1–RC3 migrations and no new database mutation. RC5 will address aggregated individual statistics and operational definitions.
