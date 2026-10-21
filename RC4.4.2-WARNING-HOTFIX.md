# E-Jadwal V3.19 RC4.4.2 — Dashboard Warning Hotfix

Baseline: RC4.4.1. Changes ONLY the dashboard warnings for class guardians (wali kelas) and co-guardians (pendamping kelas).

- Verified `NO_SUBSTITUTE` coverage (approved team-teaching decision): end after `Guru utama … izin.` No substitute clause.
- `ASSIGNED`: show `Digantikan oleh [nama pengganti].`
- `WAITING` or genuinely unassigned: show `Badal belum ditentukan.` (do NOT silently suppress a missing replacement).
- Legacy unverified `NO_SUBSTITUTE` is not treated as approved without source verification.
- Both warning panels use one shared presentation helper.
- No SQL, schema, data, package dependencies, or lockfile changes.
- Adds one regression assertion to the EXISTING registered test file.

## Patch install
Extract to project root (which contains `src/`), overwrite both files. No SQL migration, npm install or package-lock replacement. Then run:

```
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

## Important
If a particular Khoiruddin Akmal row still says `Badal belum ditentukan.`, its backend state is likely `WAITING`, not an approved team-teaching `NO_SUBSTITUTE`. Record the explicit `Tidak perlu ada badal` decision for that class/date/JP; the hotfix deliberately does not hide genuine unresolved coverage.

Validation performed here: TypeScript TSX/TS syntactic parser and source assertions PASS. Full npm test, lint, build and browser behavior require validation in your project.
