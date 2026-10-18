# E-JADWAL V3.17.3 RC1 — Unified Duty Resolution (TRACE ON)

**Baseline:** V3.17.2 RC2 full source (October 18, 2026).
**Release state:** staging candidate, NOT production-verified.

## Changes

1. **Approved leave availability:** Staff-only Supabase query loads APPROVED leave_request_periods for the chosen date, including FREE JP. Recommendations exclude those teachers only at the exact date+JP. If the query fails, the operator cannot save badal. The PostgreSQL V3.17.3 migration updates the shared staff substitute validator to reject an approved-leave substitute at the exact date+JP. No whole-day blanket block.
2. **Cross-dashboard visibility:** A read-only unified resolver derives high-priority assignments from live coverage logs and explicit dated incidentals. On the normal teacher dashboard, transferred support teachers remain visible in Team Teaching but are struck through with the destination (badal/incidental, subject/class/JP). On their own dashboard, the old support duty is labelled cancelled; the new duty is shown separately. The data source/master timetable is not modified.
3. **Incidental parity:** Explicit teacher-team incidentals and additive incidental duties are treated as assignments, not blended with unrelated lessons in a single JP card. Room-only incidental overrides do NOT cause teacher transfers.
4. **Primary-teacher safety:** If the displaced person is a primary teacher (or multiple priority duties collide), show a visible conflict instead of silently cancelling their original teaching obligation. No automatic reassignments, mutations, or assumed coverage.
5. **Clock awareness:** Actual start/end intervals take priority when available; fallback is JP when an interval is missing.

## Install (staging first)

- Back up V3.17.2 RC2 and your Supabase database. Ensure earlier V3.17.2 reconciliation produced OK schema/RPC checks.
- Execute `supabase/migrations/202610180003_v3_17_3_approved_leave_availability_guard.sql` in Supabase SQL Editor on a **staging database**, as one complete script (BEGIN/COMMIT). Confirm success and then deploy the V3.17.3 source using your normal GitHub/Vercel workflow.
- If using CLI-based migration history, apply through your established migration pipeline instead of manually applying the same migration a second time.
- With dependencies available, run: `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` on Windows. Observe Supabase auth/RLS: the detailed approved-period query requires a verified ADMIN/WAKASEK session.
- Refresh Supabase data on BOTH teacher dashboards after any badal/incidental changes. Do not mistake stale browser state for a resolver bug.

## Manual acceptance (must check with live staging data)

- Hamdan (2026-10-13): APPROVED JP4 FREE excluded from badal picker; JP outside approved leave remains eligible subject to other constraints. Attempt an invalid direct RPC save must be rejected with `SUBSTITUTE_ON_APPROVED_LEAVE`.
- Ma'ruf: personal Fiqh support JP2 is cancelled in favor of badal; Salman sees Ma'ruf struck out and destination class/subject; no changes to master.
- Abdurrazaq: explicit incidental TO at JP4 appears separately from Arabic, the Arabic support duty is marked cancelled, and the original primary teacher sees the same status.
- For both badal and incidental: undo/retire the high-priority duty and refresh; the old support duty should return without manual master changes.
- An actual primary-teacher conflict is visibly flagged and NOT automatically cleared. Double high-priority assignments are shown as a conflict rather than arbitrarily choosing one.
- Verify unaffected combined classes, date-specific overrides, JP0, dates outside leave, and public/guest read-only mode.

## Verification already performed locally

- Transpilation/syntax: 221 TS/TSX files, zero syntactic errors.
- Domain TypeScript semantic check: duty resolution and recommendation index passed using global TypeScript (without dependency installation).
- 43 domain regression tests passed, including 7 new cases for V3.17.3, using an offline CommonJS transpilation harness.
- Full `npm ci` unavailable in this environment (offline npm cache missing); therefore full Vite production build, React typecheck, browser smoke test, Supabase SQL execution and live role/RLS checks have NOT been verified. They must be done in staging before production.

## Data/privacy notes

- The staff-only approved-leave-period read gets teacher ID, date, and JP, never leave reason/evidence.
- The common SQL validator must be reached through existing authenticated staff write RPCs. Source changes do not bypass RLS or admin/Wakasek role checks.
- Existing leave requests, coverage slots and master schedules are NOT updated by the migration (function definition only).
