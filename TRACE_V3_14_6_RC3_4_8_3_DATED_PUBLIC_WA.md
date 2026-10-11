# E-Jadwal V3.14.6 RC3.4.8.3 — WA Contact per Dated Badal

## Why
V3.14.6 RC3.4.8.2 redacted all `teachers.whatsapp_e164` in the public Supabase view. This unintentionally broke **Minta Tugas via WhatsApp** on the teacher Dashboard when Admin Mode was OFF.

## New behavior
- Public/guest has no global teacher phone directory. `teachers.whatsapp_e164` remains `null` in `ejadwal_public_schedule_snapshot_v1`, which v3 composes through v2.
- Server RPC `ejadwal_public_schedule_snapshot_v3` attaches `absent_teacher_whatsapp_e164` and `substitute_teacher_whatsapp_e164` to **each live `coverageSlots` row** ONLY when `schedule_date >= (now() at time zone 'Asia/Jakarta')::date`.
- Historical, CANCELLED, or EXPIRED slots cannot return contact numbers through this projection.
- Dashboard *Minta Tugas via WhatsApp* uses the absent teacher's **per-slot** number on Admin OFF. If the date is in the past, the button is replaced by `Kontak WA sudah kedaluwarsa`, and the action checks date again at click time.
- Admin ON retains existing staff access and WhatsApp behavior.
- On a Jakarta school-date rollover the guest shell redacts expired contacts in local state and refreshes the public Supabase snapshot.
- Task descriptions/links for active coverage stay available as in RC3.4.8.2.

## SQL migration (required)
Apply `supabase/migrations/202610120005_v3_14_6_dated_public_wa_contacts.sql` AFTER `202610120004_v3_14_6_public_badal_tasks.sql` on a **staging** database first. The new public RPC is additive; v1 and v2 remain for rollback. Do not publish RC3.4.8.3 before v3 exists.

## Privacy and limitations
Admin OFF is anonymously accessible. Thus, while a coverage date is current or future, anyone who can visit the site can retrieve the dated contact using the RPC, even though teacher directory-wide contact access is still redacted. This should be an explicit school privacy decision; for stronger privacy, require a signed-in teacher for contact retrieval. Also, expired server access cannot revoke numbers copied, downloaded, or cached elsewhere in the past.

## Release gate
1. `npm.cmd test`
2. `npm.cmd run lint`
3. `npm.cmd run build`
4. In staging, request Admin OFF for a today's badal whose teacher has WA; confirm the WA button opens the correct number.
5. Inspect the guest JSON response: `teachers[].whatsapp_e164` MUST remain `null`; `coverageSlots[]` phone fields populated only for current/future active rows; historical fields MUST be `null`.
6. Test a past date on Dashboard: no WhatsApp number/button for a previous badal.
7. Test tomorrow and a browser left open past Jakarta midnight: old contact should disappear and refreshing should return `null`.
8. Test Admin ON and that task details/links remain functional.

No modifications to GAS or other SQL migrations. npm full typecheck/build and live PostgreSQL migration have NOT been verified here.
