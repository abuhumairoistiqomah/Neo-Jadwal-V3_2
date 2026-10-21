# TRACE V3.19 RC5 — Individual Teacher Operational Statistics

Base: V3.19 RC4.4.6 (RC4.4.5 + MQ TS2345 typefix).

## Implementation

- Adds a two-layer operational statistics section to the existing `Statistik Individu Guru` admin page.
- The four principal metrics, JP teaching, JP leave, days teaching, days leave, are read from existing staff-only Supabase RPC `ejadwal_teacher_effective_activity_v318`; percentages are based on the JP denominator (not day counts).
- A date-level read-only diagnostic combines the existing V3.19 RC4 duty log with RC2 teacher duties and term metadata; partial-day teaching and leave are counted as intersecting dates, not mutually exclusive days. OFF-SITE duties and compensatory off are separate from personal leave.
- If the RC4 reconstructed numbers do not agree with the V3.18 RPC numbers, the discrepancy is displayed explicitly, and canonical RPC values are never overridden silently.
- Supports the existing Individual Statistics screen's maximum 181-day range by computing RC4 logs in 31-day chunks. CSV export escapes potentially executable spreadsheet cell prefixes.
- Strict invalid/missing RPC responses fail closed. No presensi, no changes to existing schedule, badal, leave, or database schema.

## Release gates

The assistant's environment does not have installed application `node_modules`. Focused TypeScript-transpiled Node test suites: 65/65 PASS (RC1–RC5). All 258 TS/TSX files syntax-parsed. Full project `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and browser Supabase integration MUST still pass on the user's workstation before production.

## Install patch

1. Use an existing RC4.4.6 project (RC4.4.5 plus the typefix patch). Backup source first.
2. Extract the RC4.4.6 → RC5 patch into the project root, preserving relative `src/` paths.
3. No new SQL migration, npm package dependency, or environment variable is required.
4. Run `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`.
5. Open `Statistik Individu Guru`. Pick a teacher with APPROVED partial leave, a date interval covering it, and click `Tampilkan Statistik`.
6. Verify the four main counters, date drill-down, independent official-duty/compensatory markers, and the separate reconciliation warning if applicable.

## Known limits

V3.18's teaching/leave RPC predates some V3.19 teacher-duty/compensatory logic. RC5 intentionally does not present the V3.18 metrics as fully adjusted for those new rules; the RC4 operational drill-down documents context and discrepancies. Legacy date reconstructions may differ from the historically recorded schedule. This is schedule-derived, NOT verified physical attendance.

The FULL SOURCE PERSONAL ZIP contains `.env.local` (sensitive); never share it, commit it, or upload to a public repo. The PATCH and SHAREABLE bundles exclude it.
