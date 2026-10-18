# E-JADWAL V3.17.3 RC2 patch

Baseline: V3.17.3 RC1 FULL SOURCE. Apply patch in project root, preserving your `.env` and existing database.

Files changed:
- package.json / package-lock.json (version and RC2 test suite)
- src/components/JadwalLengkap.tsx (desktop/mobile operational details and mobile status styling)

Files added:
- src/domain/schedule/teacherWeeklyPresentation.ts (shared visible annotation mapping)
- src/__tests__/v3-17-3-rc2-mobile-teacher-details.test.ts
- TRACE_V3_17_3_RC2_MOBILE_TEACHER_DETAIL_PARITY.md

No database migration or additional RPC required.
