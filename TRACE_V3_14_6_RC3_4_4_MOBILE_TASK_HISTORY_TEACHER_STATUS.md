# TRACE V3.14.6 RC3.4.4 — Mobile Task Access, Admin History, Teacher Status

**Base:** RC3.4.3. No new Supabase migration, RPC, GAS or .env variable.

## 1. Lengkapi Tugas
- Guest/teacher navigation is ALWAYS clickable, regardless of client-side missing-task counter.
- Badge count remains informational; queue visibility still depends on the local `logs` snapshot and existing verified public recovery RPC. This release does not bypass authentication or disclose hidden tasks.
- Teacher account recovery (`request code` + registered WhatsApp last 4) remains in LateTaskCompletion. The action itself remains protected.

## 2. History-only filtering (Asia/Jakarta date)
- Kalender Akademik: hide events whose `dateEnd` is strictly earlier than today. Inclusive end date; today and future stay visible. Invalid dates remain visible for manual review.
- Aturan Guru Badal: hide DATE rules whose `specific_date` has passed; WEEKLY rules only expire if `valid_until` is provided and in the past. Weekly rules with no end date stay visible.
- Checkbox `Lihat yang sudah lewat (N)` restores the list including Edit/Status controls. Rows are not deleted or changed in Supabase.

## 3. Red teacher dashboard for confirmed inability to teach
- For a selected teacher and JP, red if a matching active rule has `blocks_normal_teaching = true`, or if the teacher has an explicit dated leave log.
- Example: rule for Muhibah, 2026-10-12 JP3–6 makes JP3–6 red; JP2 remains normal unless a separate reason exists.
- Do NOT infer that a teacher is absent merely because their class has an outing or academic event.
- Rules are read according to Supabase RLS: staff see relevant staff rules; a signed-in teacher sees only their own; anonymous guest does not get staff-only constraints.
- Logout clears previously loaded restriction state.

## Test / release gate
Local Windows:
```
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```
Smoke-test teacher mobile task nav, event/rule history, red JP3–JP6 for a `blocks_normal_teaching` rule, and no falsely red JP2. Confirm after logout no staff-only restriction persists.

Offline validation in tool environment: 234 tests passed (only modules loadable under a TypeScript-transpiling CJS runner); full npm suite, Vite build, React/Supabase browser runtime are **not** verified here. This is RC, not stable.

Database: RC3.4.3 preconditions remain, including calendar timeout migration `202610110052` if RC3.4.2 features are deployed.
