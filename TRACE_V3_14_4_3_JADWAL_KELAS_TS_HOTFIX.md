# TRACE V3.14.4.3 — Jadwal Kelas TypeScript Compile Hotfix

Baseline: V3.14.4.2 regression-test-hotfix, including all V3.14.4 effective-week and full-width PNG changes.

Four TypeScript errors reported in `src/components/JadwalKelas.tsx` were addressed:

1. TS18004 (`kalenderAkademik` shorthand): destructure the already-declared optional prop with a safe `[]` default.
2. TS2304 (`kalenderAkademik` in dependencies): same fix supplies the variable to the `useMemo` dependencies.
3. TS2345 (`unknown` teacher display argument): type the effective-week map as `ClassWeekMap` and the deduplicated teacher list as `string[]`.
4. TS2345 (`unknown` substitute display argument): type the effective-week map as `ClassWeekMap` and substitute list as `string[]`.

Files changed: only `src/components/JadwalKelas.tsx` (plus this trace note).

No changes to runtime scheduling rules, UI layout, Supabase migrations, Apps Script, env vars, or database content.

Validation in packaging environment:
- Syntax transpilation checked all 140 `.ts` / `.tsx` implementation/test files: 0 parse errors.
- Full `npm ci` was blocked by network/DNS (`EAI_AGAIN` for registry.npmjs.org), so full `npm test`, `npm run lint`, and `npm run build` were not performed here.

Required local verification (Windows PowerShell, inside the extracted project folder):

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

If dependencies are already installed, you can omit `npm.cmd ci`.
