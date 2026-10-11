# TRACE V3.12.3 — Learning Task + Google Drive Bridge + WhatsApp Handoff

## Scope
- Preserve V3.12.2 leave approval → WAITING → ASSIGNED flow.
- Persist structured task resources in `task_resources` while keeping `learning_tasks.description` backward-compatible.
- Treat all three operator inputs as first-class: plain text, pasted links (`LINK`), and uploaded files (`DRIVE_FILE`). Pasted URLs are detected automatically and de-duplicated against uploaded Drive resources.
- Upload task files to Google Drive through the existing Apps Script Web App.
- Require an authenticated Supabase staff session before Apps Script accepts Drive uploads.
- Add direct WhatsApp handoff for substitute teachers when `whatsapp_e164` is available.

## Database
Run migrations in order:
1. `202610080022_v3_12_3_task_drive_whatsapp.sql`
2. `202610080023_v3_12_3_verify_task_drive_whatsapp.sql`

The verifier should return 7 rows, all `true` (including explicit `LINK` and `DRIVE_FILE` support).

## Apps Script Drive Bridge
Replace/redeploy `Code.gs`, then set Apps Script **Script Properties**:
- `SUPABASE_URL` = the same public project URL used by `.env.local`
- `SUPABASE_ANON_KEY` = the same publishable/anon key used by the frontend
- optional `TASK_DRIVE_FOLDER_ID` = Drive folder ID for task uploads

If `TASK_DRIVE_FOLDER_ID` is omitted, the script creates/uses `E-Jadwal Tugas Badal`, with monthly subfolders.
Files are not made public automatically; use a folder whose sharing policy already matches the school workflow.

## Smoke tests
1. Login Supabase as ADMIN/WAKASEK and pass Input Inval parity.
2. Test plain text only: Save and confirm the task has no resource rows.
3. Test pasted link only (or text + link): Save and confirm `task_resources` has `resource_type = LINK`.
4. Upload a small file (<10 MB), choose badal, Save and confirm `task_resources` has `resource_type = DRIVE_FILE`.
5. Reload Supabase snapshot: task text should show the Drive URL as a clickable resource.
6. For a substitute teacher with `whatsapp_e164`, open Log Guru Pengganti and verify `Buka WhatsApp` pre-fills the reminder including task/link.
7. Re-test inferred combined class: one operator row, multiple canonical coverage rows, each linked to the same uploaded Drive resource metadata.

## Validation note
Package registry access was unavailable in the build environment. Local `npm test`, `npm run lint`, and `npm run build` remain the release gates on the operator PC.
