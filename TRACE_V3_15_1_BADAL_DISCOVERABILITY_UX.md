# E-Jadwal V3.15.1 RC1 — Kebutuhan Badal UX Discoverability

Based strictly on V3.15 RC1. UI-only usability hotfix.

- Kebutuhan Badal checkbox is always visible in Aturan Guru Badal.
- Disabled and visually muted until "Guru juga tidak bisa mengajar jadwal normal" is selected.
- Accessible hint explains prerequisite.
- Disabling normal-teaching block clears the Badal checkbox state, and save guards against inconsistent payload.
- Editing historical rows clamps inconsistent requires_badal=true with blocks_normal_teaching=false.
- No SQL migration, RPC, domain scheduling engine, or data model changes.

## Validation

Run: npm.cmd test, npm.cmd run lint, npm.cmd run build, npm.cmd run dev

Smoke-test: unchecked state visible/disabled; checked first checkbox enables second; toggling first back off resets the second; edit a saved constraint and check values; ensure existing official duty assignments remain intact.
