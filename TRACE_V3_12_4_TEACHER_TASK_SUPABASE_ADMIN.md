# TRACE V3.12.4 — Teacher-Owned Tasks + Scrollable Sidebar + Supabase Admin Runtime

## Scope

V3.12.4 fixes three operational issues discovered after V3.12.3:

1. Learning tasks belong to the teacher submitting leave, not to Wakasek while assigning a substitute.
2. Desktop/mobile navigation must remain usable as the menu grows.
3. Normal Admin runtime must not depend on Google Apps Script / Google Sheets availability.

## Teacher-owned task flow

```text
Teacher -> Ajukan Izin
        -> select TEACHING/FREE JP
        -> enter task per TEACHING JP
             TEXT and/or LINK
        -> select optional FILE attachment(s)
        -> submit leave (SUBMITTED)
        -> selected FILE(s) auto-upload through Drive bridge
        -> Wakasek reviews task
        -> APPROVE
        -> task copied to canonical WAITING coverage rows
        -> Proses Badal
        -> Wakasek selects substitute only
        -> task survives WAITING -> ASSIGNED
```

FREE periods never receive a learning task or coverage row.

### File upload security

The public leave submit RPC returns a random short-lived task upload token. The token:

- belongs to one leave request;
- expires after 24 hours;
- is valid only while the request status is `SUBMITTED`;
- is valid only for selected `TEACHING` periods.

Files can be selected before the teacher presses Submit. The leave RPC creates the request and capability first, then the browser automatically uploads those already-selected files. Apps Script validates that capability against Supabase before creating each Drive file, then attaches the returned Drive metadata through a second narrow RPC. A Drive failure never rolls back the already-valid leave request; the success screen exposes retry/add-file controls. Anonymous clients still cannot write task tables directly.

## Admin runtime cutover

Normal Admin mode now uses:

```text
Supabase Auth
    -> user_roles (ADMIN/WAKASEK)
    -> SupabaseScheduleRepository
    -> Supabase approval / Inval repositories
```

Admin login, refresh, leave approval, waiting list, substitute assignment, operational delete, task persistence, and audit evidence no longer require Apps Script.

Google Apps Script remains only for:

- transitional public/guest hydration from legacy Sheets; and
- Google Drive file creation for teacher task attachments.

Direct Admin routes never bootstrap from GAS. Switching into Admin also does not trigger a GAS refresh.

## Navigation fix

Desktop and mobile navigation now use a bounded flex region with:

```text
min-h-0
flex-1
overflow-y-auto
overscroll-contain
```

The Admin toggle/footer remains fixed while the menu itself scrolls.

## Database migration

Apply after V3.12.3 migrations 022/023:

```text
202610090024_v3_12_4_teacher_owned_tasks_admin_supabase.sql
202610090025_v3_12_4_verify_teacher_task_admin_supabase.sql
```

Verifier target: **9 / 9 true**.

The migration adds:

- `leave_request_tasks`
- `leave_request_task_resources`
- short-lived upload capability columns on `leave_requests`
- `ejadwal_submit_public_leave_request_v3`
- `ejadwal_validate_public_task_upload`
- `ejadwal_attach_public_leave_task_file`
- task-aware `ejadwal_decide_leave_request`
- `ejadwal_save_inval_bundle_v3` that preserves teacher-owned task data during substitute assignment

## Google Apps Script

Deploy the V3.12.4 `Code.gs`. Keep Script Properties:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY   (preferred)
# or SUPABASE_ANON_KEY     (legacy fallback)
TASK_DRIVE_FOLDER_ID       (recommended, optional)
```

The `upload_leave_task_file` branch executes before `getSpreadsheet()`, so a teacher file upload does not require the spreadsheet to open successfully. With the modern `sb_publishable_...` key, Apps Script sends it only as the Supabase `apikey`; the short-lived public task capability is validated by the narrow RPC. Legacy JWT anon keys remain supported as a fallback.

For usable file permissions, configure `TASK_DRIVE_FOLDER_ID` to a school Drive folder whose sharing policy already allows intended staff/substitute teachers to view its contents.

## Regression gates

1. Teacher submits TEXT task -> request task stored.
2. Teacher submits LINK task -> structured LINK resource stored.
3. Teacher uploads FILE after submit -> Drive file + DRIVE_FILE resource stored.
4. JP FREE -> no task and no badal coverage.
5. Wakasek approval shows teacher task before approval.
6. APPROVE copies task to every canonical coverage row, including combined classes.
7. Waiting List displays the task.
8. Proses Badal shows task as read-only and assignment preserves task/resources.
9. Admin login/refresh/approval/badal still work if legacy GAS/Sheets is unavailable.
10. Desktop/mobile sidebars can scroll to the last menu item.

## Local commands

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Open:

```text
http://localhost:3000/
```
