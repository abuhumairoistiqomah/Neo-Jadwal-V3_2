# E-Jadwal V3.14.6 RC3.3 — Calendar Atomic Classes + Conflict Hide

Base: V3.14.6 RC3.2. **Staging candidate, not production stable.**

## Calendar class identity
- `classes` includes legacy composed class labels for shared teaching sessions. In Calendar Akademik *Kelas Terdampak*, show atomic/individual classes only; group labels are not additional classes.
- Existing event groups based on compound class IDs are expanded to matching atomic class IDs when opened for editing. If a constituent has no atomic Master Data row, preserve the legacy group ID and show a warning instead of silently dropping it.
- Each selected atomic class is written as an individual `academic_events` row, sharing the same `admin_group_code`. Existing domain `isClassMatch` then matches that atomic event to joined teaching session labels.
- Calendar insert failures display full Supabase error `message/details/hint/code` near Save (including Error subclasses) (not `[object Object]`). On revisions, insert the replacement before deactivating the old event, with best-effort compensation on update failure. Browser operations are still not fully atomic; validate staging.

## Conflict hide
- Each warning/blocker in Versi & Konflik Jadwal has **Sembunyikan / Sudah Ditangani**. Restore with **Lihat yang disembunyikan** → **Tampilkan Lagi**.
- Hidden items are omitted from Action Center in the same browser (after navigation), but this is **browser-local localStorage**, not a global Supabase acknowledgement. Do not treat hidden items as actually resolved in the database.
- Fingerprint includes conflict ID, kind, severity, date, JP, details, classes, teachers and room. A materially changed conflict returns to visible. Truly fixed conflicts disappear when conflict detector stops reporting them.
- Existing date-based expiry and permanent master warning rules remain unchanged. No SQL changes.

## Testing
- New 8 regression tests include class-choice filtering, legacy expansion, preservation of unresolved targets, combined-session calendar matching, reversible conflict hide, changed-conflict visibility, Supabase error formatting, and revision write-order.
- Offline broad suite: 277 assertions PASS, two test modules unable to load (`react`, `@supabase/supabase-js` packages unavailable). 157 TypeScript files parse without syntax errors. Full npm test/lint/build and live Supabase browser validation must run locally.

## Deployment gate
1. Extract full ZIP or overlay patch on **RC3.2** (do not overlay on earlier RC).
2. `npm.cmd install`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev`.
3. Test Calendars: search `01 MQ AKHWAT`, confirm there are no explicit `&` / `+` selections; select 01 and 02 as individual classes for Rumah Tahfidz 2; Save; reload and verify all affected classes and combined session effective schedule.
4. Edit a legacy Calendar event that previously targeted `01 MQ AKHWAT & 02 MQ AKHWAT`; confirm its selection becomes 01 + 02, then Save Revision and refresh.
5. Hide one *known acceptable* conflict; verify Action Center count decreases, toggle **Lihat yang disembunyikan**, restore it, verify count returns. Repeat after page reload in same browser. Cross-browser is not synced.
6. Do NOT push RC3.3 to Vercel production until staging verification passes. No new migration: RC1–RC3 SQL migrations still need to exist in the target Supabase environment.
