# E-Jadwal V3.14.6 RC1 — Conflict Expiry, Incidental Error Diagnostics, Weekly Room Editor

Built from the V3.14.5 full-source release. This is a **release candidate**, not an automatically verified production release.

## What changed

1. **Conflict Center / date expiry**: a conflict with a concrete ISO calendar date earlier than the user's local current date is hidden from the active list and headline counts by default. Checkbox **Lihat histori konflik** restores archived/expired entries. Weekly master conflicts (e.g. `Senin`, `Rabu`) never expire because they recur. No records are deleted.
2. **Jadwal Insidental / error handling**: Supabase error objects are formatted with `message`, `details`, `hint` and `code` instead of displaying `[object Object]`. This improves diagnostics. It does **not** guarantee that any underlying RPC error is fixed; the next displayed message must be investigated on its merits.
3. **Jadwal Ruangan / Sunday bug**: the former weekend arithmetic labeled Tue 6 Oct 2026 as Mon, which could cause edits on the wrong date. The default weekend view now correctly starts on **Mon 12 Oct 2026** when accessed Sun 11 Oct 2026, while the previous-week arrow starts on Mon 5 Oct.
4. **Weekly room editor**: ADMIN/WAKASEK can activate **Edit Ruangan Minggu Ini** and select any JP/day, on desktop or mobile. Two operations:
   - **Relokasi kelas**: select an existing session, choose a destination room and reason. The app groups inferred combined sessions (same subject, teachers, room) and moves the group atomically via a dedicated dated Supabase RPC. Existing incidentals retain teacher/subject overrides.
   - **Tambah sesi**: assign a new class/activity to an empty room/JP for that date, with class, subject, teaching staff and reason. An atomic server-side wrapper does the activity insert and room allocation as one transaction.

The canonical **schedule_master is not mutated**. Writes are dated incidentals and are versioned/audited through the existing `audit_logs` trigger. Room conflicts are checked against effective room allocation for the date, not simply static master occupancy. Academic-calendar suppression is respected when determining room occupancy.

## Deployment requirements (IMPORTANT)

- **New SQL migration is required:** `supabase/migrations/202610110001_v3_14_6_weekly_room_editor.sql`.
- Apply to the **Supabase staging database first** using your existing migration procedure / SQL Editor. The GitHub/Vercel push does **not** automatically run a SQL migration.
- Use a staging Vercel deployment connected to staging Supabase for initial testing. Do NOT merge/deploy to production before migration and full local CI pass.
- Frontend Vercel environment variable names and Apps Script are unchanged.
- Avoid testing mutations against production while reviewing this release candidate.

## Minimum acceptance tests

1. `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` on Windows.
2. Conflict Center: dated 6 Aug conflict hidden on 11 Oct; toggle reveals historical; weekly master conflicts remain.
3. Insidental error: if Supabase rejects a write, the actual error text + SQL code appears, not `[object Object]`.
4. Sunday 11 Oct 2026: Jadwal Ruangan shows 12–16 Oct; previous is 5–9 Oct. Verify both desktop and mobile.
5. Empty room: choose an existing scheduled class from another room and relocate to the empty one for only the selected date. Other days and master stay unchanged.
6. Occupied room: move one class to an empty room. Confirm the original date/JP becomes free.
7. Combined class: move both linked classes atomically. Check the green combined state remains intact.
8. Additional session: choose a class without a scheduled session in the slot, mapel, teacher, and vacant room, then save. Check the class and room pages.
9. Attempt occupied-room allocation: UI and backend must reject without partial writes.
10. Use Publish History and rollback on a *staging* test version. Verify room state restores and leave/badal records are preserved.
11. Repeat a room edit on a date that already has an incidental change to confirm subject/teacher overrides remain unchanged.

## Verification in the packaged RC

- Syntax transpilation of all 146 `.ts` / `.tsx` files: passed.
- Standalone domain assertions (Sunday week start, expiry semantics, formatter): passed.
- Full `npm ci` / `npm test` / `npm run lint` / `npm run build`: **NOT RUN / NOT VERIFIED** because `registry.npmjs.org` DNS resolution failed in this environment.
- SQL execution against a live Supabase instance: **NOT RUN**. Apply and test migration on staging.
