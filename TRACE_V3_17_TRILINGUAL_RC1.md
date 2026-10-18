# TRACE V3.17 RC1 — Static Trilingual UI Pilot

Baseline: **V3.16.3 RC1**. Status: **Release Candidate for localhost/staging**, not production stable.

## Scope implemented

- Three switchable interface languages: **Bahasa Indonesia (ID, default), English (EN), Modern Standard Arabic (AR)**.
- Language selector in the bottom of **desktop sidebar**, **collapsed desktop sidebar**, and **mobile hamburger drawer**. Deliberately not in the tight mobile header.
- Browser-local preference: `ejadwal_ui_language_v317`, independent of Admin Mode and authentication. No Supabase table or migration needed.
- Local, hand-maintained, static dictionaries under `src/i18n/translations.ts` with **384 matching phrase keys per language**; missing phrases safely fall back to Indonesian.
- Shared React context and `<T>` UI text component; translated menu headings, page navigation, key timetable screens, leave-request controls, education-calendar screens, Smart Audience labels, and assorted admin/page labels.
- Localized month/dates for the School Calendar and leave form, translated weekday headers in teacher/class schedules and dashboard, and locale-aware displayed week labels. **Dates and week IDs used in business logic remain ISO**.
- Arabic uses RTL **only on translated text segments**. The global page, sidebar, schedule grid, period ordering and export layout remain LTR. No right-to-left mirroring of the entire application.
- **No translation** of school-generated content: teacher names, class codes, official subjects, leave reasons, assignments, messages, raw Supabase records, WhatsApp templates, or calendars' user-entered event titles/descriptions. Database enumerations and API payload values remain unchanged even when their visible labels are localized.
- No remote translation API, new packages, background requests, or additional runtime Supabase queries.

## Manual smoke test checklist

1. Open app on a **narrow mobile width** (~320–375px): hamburger → language selector. Confirm header search/refresh/avatar do not gain a new button or overflow.
2. Select **English**, close sidebar, navigate Dashboard → My Timetable → Class Timetable → School Calendar → Request Leave. Confirm translated headings, weekdays, week/date labels, important form controls.
3. Select **العربية**, check Arabic typography and label-level RTL while sidebar remains on the left, and JP1 through JP6 remain in their original order.
4. Refresh the browser and navigate pages: selected language should persist without a login.
5. Select **ID**: ensure the pre-V3.17 Indonesian UI and schedule behavior remain consistent.
6. Open **Input Kalender Pendidikan** as ADMIN, switch languages, and inspect the category dropdown: translated display must still save original enum values (e.g. `Kegiatan Siswa`).
7. Enter a user event with Indonesian title, switch to EN/AR: the title and all descriptions must remain exactly as entered. Repeat for teacher names, leave reasons, and class codes.
8. On Jadwal Pribadi / Jadwal Kelas, toggle Normal/Insidental, change week and export PNG. Check no effective-schedule/coverage/JP regressions.
9. Sign out: confidential management activities must remain restricted by existing Supabase RLS, independently of displayed language.
10. Audit remaining infrequent **admin-specific copy, long explanatory messages, JavaScript alerts, generated PNG headers, and legacy dialogs** in EN/AR before treating this release as fully translated. In RC1 untranslated strings fall back to Indonesian on purpose.

## Testing and limitations

- Dedicated V3.17 pure locale regression tests: **6/6 PASS** in a dependency-free offline TypeScript transpile runner.
- TypeScript/TSX parse diagnostics: check using tool, not a complete typecheck/build.
- npm dependencies couldn't be installed in the packaging environment: `npm ci` failed with `EAI_AGAIN registry.npmjs.org`. **`npm test`, `npm run lint`, `npm run build`, browser screenshot smoke tests not verified**.
- The source includes a partial translation rollout: core workflows are localized, but **some secondary/legacy screen text remains Indonesian** and must be polished before any claim of 100% translation coverage.

## Commands (Windows PowerShell)

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

No SQL migration is required. Deploy to production only after the above gates and manual smoke checks pass.
