# V3.14.6 RC3.4.9.2 — Bukti Izin Manajemen (STAGING CANDIDATE)

Base: RC3.4.9.1. Includes all Syaikh Ali flexible import and Log Badal layout fixes. **No deployment to production without SQL/Storage verification.**

## New rules

1. In **Ajukan Izin**, teachers must attach a management permission screenshot (JPEG, PNG, WEBP, maximum 5 MB). Button stays clickable if no file: a dialog says **“Harus upload bukti izin dari manajemen.”** It does not submit a request.
2. Requests with a file first become **`PENDING_EVIDENCE`**. A private Supabase Storage upload and server-side object verification must complete before the request changes to **`SUBMITTED`**. Only SUBMITTED is shown in the Wakasek approval queue.
3. If upload or verification fails, the request remains pending; the same form retries against the **same request ID** (no duplicate). Retrying requires keeping the same tab open and completing within the token's 24-hour lifetime. A broader cross-device recovery flow is a separate follow-up.
4. Admin/Wakasek can click **Lihat Bukti Izin Manajemen** in **Persetujuan Izin** and view a short-lived private signed URL. Staff must verify that the screenshot is genuine. Student/management private numbers should be redacted when possible.
5. Legacy SUBMITTED requests are grandfathered (`evidence_required=false`), shown with a warning that no proof was registered. New requests require proof.
6. Screenshot evidence is **not** the public task attachment or Google Drive link. The bucket `ejadwal-leave-evidence` is private. Anonymous users cannot list/download screenshots. Storage INSERT is restricted by a one-time, random, expiring request path. Signed reads are staff-only.

## Mandatory SQL (staging FIRST)

`supabase/migrations/202610120006_v3_14_6_management_leave_evidence.sql`

Requires prior migrations through `202610120005`. Applies Storage bucket, RLS policies, RPC v4, evidence finalization, approval trigger, and revokes old public submit RPCs to prevent proof bypass. Do **not** deploy frontend first: the new frontend requires RPC v4.

## Test matrix

- Valid teacher/date/JP + no screenshot: dialog; nothing submitted.
- Screenshot > 5 MB, PDF, empty: blocked before creation.
- Valid JPG: `PENDING_EVIDENCE` -> Storage upload -> `SUBMITTED` -> Wakasek queue.
- Deliberately deny Storage upload: still `PENDING_EVIDENCE`, no queue, no coverage. Retry same tab succeeds when Storage access restored.
- Anonymous attempts to download/list proof: denied. Admin/Wakasek click signed URL: allowed; link expires after 120 sec.
- Attempt API call to v3 legacy submit as anon: permission denied.
- Approve new request lacking verified proof by database: blocked by trigger.
- Previously-existing `SUBMITTED` request: still reviewable (manual evidence check advised).
- Older teacher-owned tasks, JP0, JP Free, WA, dated schedule, Syaikh Ali flexible import: unchanged.

Local release gate:

```
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

This package was statically verified; full npm install/test/build and live Supabase SQL/Storage were not run in the artifact generation environment.
