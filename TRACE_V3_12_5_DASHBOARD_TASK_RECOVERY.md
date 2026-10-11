# TRACE V3.12.5 — Dashboard Session Merge + WA Handoff + Late Task Recovery

## Why this patch exists

V3.12.4 completed teacher-owned task submission and Supabase-only Admin runtime, but live testing exposed five operational gaps:

1. canonical coverage rows leaked back into the teacher dashboard, so one inferred combined session appeared as multiple badal cards;
2. a substitute with no task had no fast way to ask the absent teacher for material;
3. FREE periods in the leave form were visually too similar to teaching periods;
4. DECLINE had no immediate WhatsApp handoff explaining the decision;
5. a teacher who submitted leave before preparing material had no safe late-task recovery path.

## V3.12.5 behavior

### Dashboard badal session merge

`coverage_slots` stays canonical per class. The dashboard now groups active badal rows by the same inferred teaching-session signature used by V3.12.1 (JP/time + subject + teacher set). A combined class such as `05 MQ IKHWAN + 05 MQ AKHWAT` is rendered once while both coverage rows remain in Postgres.

### Missing-task WhatsApp shortcut

If the selected substitute teacher has an Inval card whose task is empty, the dashboard shows `Minta Tugas via WhatsApp`. The button targets the absent teacher's `teachers.whatsapp_e164` and pre-fills date, JP, subject, class and a polite request for material.

### FREE period visual semantics

FREE periods use a sky-blue card/border family even before selection; TEACHING keeps the neutral/emerald family. This makes attendance-only absence slots obvious before a teacher checks them.

### DECLINE WhatsApp handoff

A rejection note is now mandatory. After a successful DECLINE, an overlay shows the prepared message with `Salin Pesan` and `Buka WhatsApp`. If the teacher has no WhatsApp number, copy remains available and the WA button is disabled.

### Late task recovery

A new public page, `Lengkapi Tugas`, is only enabled when the currently selected teacher has an assigned badal with no task. Same-device submissions reuse the high-entropy upload token stored locally. Cross-device recovery requires:

- request code; and
- the final four digits of the teacher's registered WhatsApp number.

The server issues a fresh temporary token only for `SUBMITTED` or `APPROVED` public leave requests. The upload window remains valid through shortly after the leave date. Text/LINK task updates go directly to Supabase; file uploads continue through the existing GAS Drive bridge. Sync triggers immediately propagate late task content/resources to every existing `LEAVE_WORKFLOW` coverage row for the same request + JP, including already-assigned substitutes.

## Database migration

Run, in order:

- `202610090026_v3_12_5_dashboard_task_recovery.sql`
- `202610090027_v3_12_5_verify_dashboard_task_recovery.sql`

Verifier target: **9 / 9 true**.

V3.12.5 does **not** change `Code.gs`; the V3.12.4 Drive deployment stays valid.

## Regression gate

Run:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Then smoke-test: combined badal dashboard grouping, missing-task WA request, distinct FREE slot color, decline + WA overlay, and late task text/link/file propagation into an already-assigned badal.
