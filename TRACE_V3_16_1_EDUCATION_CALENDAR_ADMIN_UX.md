# TRACE V3.16.1 — Kalender Pendidikan Admin UX Hotfix

Based on V3.16 RC1. Frontend/domain-only; no new SQL migration.

1. **Edit** on Input Kalender Pendidikan scrolls to the editor using an element ref and `scrollIntoView`. The app uses a nested `overflow-y-auto` pane, so `window.scrollTo` is not appropriate here.
2. **Tampilkan kegiatan lampau** checkbox starts unchecked. The admin list hides events with `end_date < today` (school timezone `Asia/Jakarta`); multiday events remain until their end date inclusive. Draft, published and cancelled events are treated equally by this view-only date filter.
3. The list header counts visible events and displays the number of hidden historical events. Archived items are still stored and can be shown/edited. No database deletion or status changes occur.
4. Calendar-public view, Dashboard reminders, Smart Audience, management RLS, and operational schedules are untouched.

## Local release gate

From an existing V3.16 project: extract the patch over the project root. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev` in Windows. In Admin > Input Kalender Pendidikan, verify scrolling, historical checkbox, and boundary cases (an event ending today, one ending yesterday, a multiday event). No Supabase migration needed for this hotfix.
