# TRACE — V3.15.2 Smart Official-Duty Badal Picker

Base: V3.15.1. No SQL migration added. Use the V3.15 official-duty migration previously applied.

## Behavior

- `Aturan Guru Badal → Tentukan Badal` opens the **same smart Input Inval recommender** used by the existing badal workflow, displayed in an in-page dialog rather than the V3.15 bare teacher dropdown.
- Gender fit, conflicts, day/week workload, subject ranking, and candidate verification remain part of the existing recommender. Existing personal leave / approval flow remains untouched.
- Context is locked to the restriction ID, selected date, its reason, and **uncovered instructional slots only**. `src/domain/inval/officialDutySelection.ts` validates class/period scope before saving.
- The official-duty save callback calls `ejadwal_assign_official_duty_badal_v1` directly. **No personal leave is created**, and `reason_snapshot` continues to come from the restriction on the server.
- A restriction already covered for a date retains the "Badal Aman" state; a weekly rule is still per date.
- The official-duty picker intentionally does not offer task attachments or room relocation, because that RPC does not persist those fields. Other Input Inval routes retain them.
- **Important non-atomicity:** one official-duty RPC call per class/JP, so the UI reports any partial success and refreshes assignments on failure. The backend validates each assignment. For larger atomic batches a separate server-side batch RPC would be needed.

## Release verification

Windows release gate:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Smoke tests:

1. Create a dated restriction with `blocks_normal_teaching` and `requires_badal` for 1–2 active periods. Select `Tentukan Badal` and verify smart dropdown shows gender and day/week load.
2. Confirm date, teacher, reason and eligible class/JP are locked. Select a substitute, save, refresh, and check `OFFICIAL_DUTY` source in `coverage_slots` and the correct restriction ID.
3. Verify `Badal Aman` when all slots are filled, and no new `leave_requests` row.
4. Try a recurring restriction on a different date; it should not inherit prior week's completed state.
5. Test JP0 multiclasse and explicit combined classes, and confirm canceled lessons do not become fake needs.
6. Run the existing `Persetujuan Izin -> Proses Badal` separately; ensure it still uses the full Input Inval flow and ordinary leave write path.

Do not deploy to production until integration testing and the full Windows gate pass.
