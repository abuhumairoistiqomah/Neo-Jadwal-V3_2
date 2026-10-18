# TRACE V3.16.2 — Reversible Education Calendar Soft Delete

Based on V3.16.1 RC1. **REQUIRES SQL migration** `supabase/migrations/202610180001_v3_16_2_education_calendar_soft_delete.sql`.

## User flow
- Logged-in ADMIN opens **Input Kalender Pendidikan**. Every non-deleted event has **Hapus** with an explicit browser confirmation.
- Once soft-deleted, the record remains in Supabase (its DRAFT/PUBLISHED/CANCELLED status is untouched), but disappears from the public calendar, Dashboard reminders, non-admin RLS reads and the normal admin list.
- Admin can check **Tampilkan kegiatan terhapus** (off by default), inspect a red TERHAPUS label, and choose **Pulihkan**. This works independently from the existing **Tampilkan kegiatan lampau** checkbox.
- Restore retains the original event status, including DRAFT and CANCELLED. Restoring a previously PUBLISHED event exposes it to its former audience again immediately, so restoration has a warning/confirmation.
- Soft delete, restore and last-deletion/restoration metadata use privileged Supabase RPC functions. No hard delete is granted.

## Database and security
- Adds `deleted_at`, `deleted_by`, `restored_at`, `restored_by` to `education_calendar_events`; no table or rows deleted.
- Updates BOTH permissive non-admin SELECT policies to require `deleted_at is null`. Merely adding a new permissive policy would not protect deleted rows because policies combine via OR.
- Existing ADMIN SELECT remains intact for history and recovery. Authenticated ADMIN role is verified inside SECURITY DEFINER RPCs (timestamp/actor from Supabase, not client). No new public role permissions or changes to Academic Calendar/operational schedule.
- Public repository queries also apply `deleted_at IS NULL` as defense in depth; reminders refuse records with `deleted_at` even if fetched from cached/mocked data.
- **Migration REQUIRED BEFORE deploying frontend**: client queries reference the new columns and RPCs.

## Installation and release gate
1. Back up V3.16.1 source and Supabase data. Test on STAGING first.
2. Apply the new V3.16.2 SQL in Supabase SQL Editor (AFTER V3.16 SQL).
3. Apply the patch zip into the V3.16.1 project root, keeping relative paths, or use full-source zip.
4. On Windows run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev`.
5. As ADMIN, create a disposable PUBLISHED event, verify it appears in calendar/reminder, click Hapus, verify disappearance as ADMIN/WAKASEK/guest, enable deleted checkbox, click Pulihkan and verify reappearance. Check that a DRAFT or CANCELLED event retains its previous status after restore. Check both archive checkboxes, and reload the page. Attempt the two RPCs as anonymous/non-admin and confirm denial.

## Validation limits
- The calendar unit and related regression tests pass in a TypeScript transpile-based offline runner; frontend parse passes.
- npm dependencies, full TypeScript type check, Vite build, live SQL migration and browser smoke tests are **NOT verified** in this workspace. This is a release candidate for localhost/staging only, not production-stable.
