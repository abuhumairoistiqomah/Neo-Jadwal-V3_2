# V3.14.6 RC3.4.4.1 — TypeScript / regression release gate

Base: RC3.4.4. **No runtime business logic, SQL, or GAS changes.**

## Fixes
- `src/App.tsx`: remove five stale `item.disabled` references. `Lengkapi Tugas` remains clickable for guest/teacher on desktop and mobile.
- `src/components/AcademicCalendarAdmin.tsx`: explicitly type `filterOperationalHistory<AcademicEventGroup>` to avoid `unknown` inference in rendering and actions.
- `src/components/SubstituteConstraintAdmin.tsx`: explicitly type `filterOperationalHistory<SubstituteConstraintAdminRow>` for the same reason.
- `src/__tests__/v3-14-1-ux-export-rotation-hotfix.test.ts`: adapt old text-based assertions to generated `SearchableSelect` option labels for 2/3/4-week rotation. Rotation behavior unchanged.
- Add dedicated static release gate tests and update package metadata.

## Windows validation
```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

This environment could not fetch npm dependencies (DNS EAI_AGAIN), so the full TypeScript typecheck / Vite build must be confirmed on the Windows machine **before pushing to GitHub or Vercel**.

No Supabase migration needed for this hotfix; prerequisites from RC3.4.4 are unchanged.
