# V3.17 Trilingual RC1 Patch

Base ZIP: `e-jadwal-v3.16.3-sidebar-reminder-ux-full.zip`.

1. Back up your local V3.16.3 folder.
2. Extract the `e-jadwal-v3.17-patch-from-v3.16.3.zip` archive **into the V3.16.3 project root**, preserving directory structure and overwriting changed files.
3. No SQL migration and no new npm dependency.
4. On Windows run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev`.
5. Test language selector via mobile hamburger and desktop sidebar. Verify calendar, leave request, timetable week/date labels, and existing Supabase security.

The source code changes UI text presentation only; IDs, routes, assignment logic, leave data, RLS policies, schedule engine and school information remain unchanged. This is a *trial RC1*, not a complete translation audit of every rare admin/legacy message.
