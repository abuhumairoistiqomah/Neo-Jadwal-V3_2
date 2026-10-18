# E-Jadwal V3.15.5 RC1 — Teacher Dated Priority + Autocomplete Performance

Baseline: V3.15.4 RC1. Frontend/domain-only patch; **no SQL or Supabase migration**.

## 1. Avoid duplicate teaching assignments on Jadwal Lengkap Guru

- Dated `BADAL` or `INSIDENTAL` assignments win over old master assignments on the **same calendar date + JP** in the **teacher's effective weekly view**.
- This covers a teacher who was a companion/assistant in a master class and is now acting as the substitute in another class.
- `Jadwal Normal` still shows original master assignments. The master schedule, coverage records, classmates, and teacher teams are **not modified**.
- Multiple competing dated assignments are still shown; this view change does not mask genuine dated-vs-dated conflicts. Conflict Center continues to check underlying data.
- This is presentation-only precedence, not an automatic release of companion-teacher responsibilities in canonical class records. If the school requires explicit class-team changes, update those records separately.

## 2. Faster teacher search

- Move global header autocomplete query into `TeacherHeaderSearch` local component state. Keystrokes no longer update top-level `App` state and trigger full page rerenders. Choosing/clearing an actual teacher still updates shared selected-teacher state.
- Memoize the effective 5-day teacher view and its week-day array in `JadwalLengkap`; typing in its local teacher search no longer runs `buildTeacherWeeklyView` unless relevant data, mode, week, or teacher changes.
- No search network request or new Supabase dependency.

## Validation

- 19/19 targeted offline regression tests passed (including new replacement and performance cases).
- 201 TS/TSX files parsed, 0 syntax errors.
- Full `npm test`, `npm run lint`, `npm run build`, and browser smoke tests still required on Windows with dependencies installed.

## Windows QA

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

1. Jadwal Lengkap Guru → Ma'ruf → Jadwal Insidental → appropriate week: badal visible, the old companion duty in the same JP hidden.
2. Switch to Jadwal Normal: canonical companion role remains.
3. Check Salman or other master pengampu: teaching still visible.
4. Export PNG: same prioritized view (no duplicate cell).
5. Type rapidly in top header search and teacher search. Confirm responsiveness in both desktop and mobile.
6. When two distinct dated assignments truly conflict, verify both remain inspectable and Conflict Center still reports the conflict.
