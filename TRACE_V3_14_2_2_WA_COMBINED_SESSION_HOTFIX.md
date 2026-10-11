# TRACE V3.14.2.2 — WhatsApp Combined Session Hotfix

## Problem
`LogGuruPengganti` broadcast grouped rows only by absent teacher. Canonical coverage rows from a combined session therefore leaked as separate WhatsApp lines.

Example before:
- JP 4 — 08 MQ AKHWAT — Arabic — Nasywaa
- JP 4 — 08 AE 3 A — Arabic — Nasywaa

These are one physical combined substitute session and must be broadcast once.

## Fix
- Added `groupSubstituteLogsForBroadcast()`.
- Broadcast identity: date + absent teacher + JP + normalized subject + normalized substitute teacher.
- Matching canonical rows are recombined and class names are rendered with ` + `.
- Rows with different subject or different substitute remain separate.
- Persistence/database rows are untouched; this is a presentation-layer recombination only.

## Expected Akmal output
`2. *JP 4* (*08 MQ AKHWAT + 08 AE 3 A* - *Arabic*) digantikan oleh *NASYWAA PUTRI ARDYA*`

## Deployment
No SQL migration. No GAS redeploy. Replace frontend source and rebuild.
