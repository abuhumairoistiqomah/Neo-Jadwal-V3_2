# Patch V3.17 RC1 → V3.17.1 RC1

Extract `e-jadwal-v3.17.1-patch-from-v3.17.zip` **at the root of your V3.17 project**, overwriting changed files. Use the provided full-source ZIP only if you prefer a clean new folder.

- Fix the TS2554 `pretty(selectedDate)` lint error by passing the UI locale.
- Update legacy V3.16.1/V3.16.3 regression assertions to reflect translated labels while still verifying menu layout, event counts, and reminder collapse button.
- Add a test to prevent the calendar locale regression.
- Align `package.json` and `package-lock.json` version to `3.17.1-rc.1`.

No schema change, SQL migration, new dependency or deployment change.

Windows release gate:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

If dependencies are not installed, run `npm.cmd ci` first. Do not deploy until all three release gate commands pass.
