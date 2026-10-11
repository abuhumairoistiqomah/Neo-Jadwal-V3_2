# E-Jadwal V3.14.6 RC3.4.5 — JP0 + Operational UX

Baseline RC3.4.4.1, all previous calendar bulk migrations preserved.

Changes:
1. JP0 multi-class wali/pendamping: frontend creates one attendance JP0 with multiple coverage class rows; SQL validator matches each class component in `teachers.notes`, including separators +, &, comma, semicolon, slash, `dan`.
2. SearchableSelect retains caret dropdown, editable text, no magnifying glass; selecting requires choosing one of the listed IDs.
3. Date-specific instructional reassignment can proceed during non-holiday calendar events while canceled original KBM stops appearing as a competing teacher assignment. Holiday and room-only edits still honor cancellation. Dashboard, class, room projections aligned.
4. Persetujuan Izin -> Proses Badal opens the existing Inval page in a new tab; no Inval form redesign.

**Database migration required** `supabase/migrations/202610110053_v3_14_6_multi_class_homeroom_leave.sql` after migration 052. Test on staging and take backup before production. Frontend alone does not fix the JP0 validation.

Critical staging smoke tests:
- Check Mar'i `teachers.additional_task` and `teachers.notes` against actual `classes` codes. JP0 should yield two coverage classes and one attendance period.
- Test leave for Mar'i on a valid school day, then approval and badal per actual class; no duplicate leave period.
- Check Istiqomah during Rumah Tahfidz: canceled class 04 INTER does not collide with explicit assignment 09 AE/MQ; check Dashboard, Jadwal Kelas, and Jadwal Ruangan.
- Verify holidays still suppress KBM.
- Verify native rotation and room-only edits are not erroneously revived when calendar cancels.
- Open Proses Badal and confirm approvals remain in previous tab.

No live database migration, npm typecheck, browser production smoke test performed here. Hold production deployment until staging verified.
