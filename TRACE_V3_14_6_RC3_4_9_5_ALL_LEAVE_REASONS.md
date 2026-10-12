# V3.14.6 RC3.4.9.5 — All Leave Reasons in Individual Statistics

Built from RC3.4.9.4. The Statistics Individu Guru report now presents **all recorded leave reasons**, including school duties, accompanying students to competitions, family events, illness, and unspecified historical entries. No new Supabase migration is needed; existing staff-only RPC v2 already returns reason text for approved requests and active legacy/manual coverage logs.

## UI

- Replaces sickness-only section with **Rekap seluruh alasan izin (internal)**.
- Filters: all reasons; keyword-related to sickness; other reasons; reason missing. Free-text search by recorded reason.
- Aggregated table: original reason, distinct absent dates, JP teaching, JP0/Free, total JP (date/JP deduplicated).
- Detailed table: date, original reason, request scope, JP teaching, JP0, JP Free, total, and source (approved, legacy, manual).
- Summary table and detailed table both included in browser print/PDF.
- Filter is NOT an automated judgment of motive or validity; sickness is identified by keywords only.
- Existing heatmaps, JP statistics, management WhatsApp shortcut, and admin-only access unchanged.

## Release gate

Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` on Windows and smoke-test using a teacher with recorded competition/school-duty leave plus sickness-related leave. Ensure Admin OFF cannot view this report. No new SQL migration for RC3.4.9.5; RC3.4.9.4 prerequisites still apply.
