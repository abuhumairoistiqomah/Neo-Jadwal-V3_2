# E-Jadwal V3.1 — Baseline Safety Net

Status: **characterization baseline**. V3.1 intentionally does **not** refactor the production behavior copied into V3. The purpose of this release is to create a safety net before structural changes begin.

## Automated baseline coverage

`src/__tests__/domain-baseline.test.ts` locks current pure-domain behavior for:

- Indonesian/English day normalization and comparison.
- Monday–Friday school-week generation.
- Class matching, including Wali/Pendamping prefixes and combined class fields.
- Current `kelasgabung` truthy/false representations.
- Room ID/name/alias resolution and unknown-room fallback.
- Meaningful-value semantics, including `0` as a valid value.
- Date normalization and inclusive date ranges.
- Academic-calendar status, scope, full-day/partial-JP behavior, class coverage, and JP 0.
- Current recommended weekly load threshold: 24 JP.

Run with:

```bash
npm test
npm run lint
npm run build
```

## Golden scenario ledger

These scenarios are deliberately documented before a canonical Effective Schedule Engine exists. During V3.2+ refactors, compare the affected screens against this ledger and the staging database.

### CASE 01 — Regular schedule only

**Setup:** selected date has a normal master `Jadwal` slot and no matching `Jadwal_Insidental`, `Log_Izin`, or calendar event.

**Baseline expectation:** the regular class, mapel, teachers, room, and JP remain visible as the master schedule defines them.

### CASE 02 — Incidental teacher override

**Setup:** a `Jadwal_Insidental` row matches `tanggal + kelas + jam_ke`.

**Baseline expectation:** the matching slot is treated as an override rather than an additional copy. Non-empty incidental teacher/mapel data can replace master values. Standalone incidentals that match no master slot remain additional sessions.

**Known V3 baseline risk:** teacher inheritance is implemented inconsistently in existing components. In particular, some master `guru2`–`guru6` values can be erased by blank-string incidental fields. Do **not** encode this defect as desired behavior; fix it only when the canonical merge rule is introduced.

### CASE 03 — Incidental room override

**Setup:** matching incidental contains a non-empty `ruangan`.

**Baseline expectation:** effective room uses the incidental room. If the incidental room is blank, room-aware views should inherit the master room.

### CASE 04 — Teacher leave + substitute

**Setup:** `Log_Izin` matches date/class/JP and contains `guru_izin` plus `guru_pengganti`.

**Baseline expectation:** the UI can show the original teacher as absent and the substitute as the replacement for that slot.

### CASE 05 — Leave + room relocation together

**Setup:** the same slot has teacher leave/substitution plus a room-only incidental.

**Baseline expectation:** teacher substitution comes from `Log_Izin`; room relocation comes from `Jadwal_Insidental`. Neither source should destroy the unrelated field from the other source.

### CASE 06 — Combined class

**Setup:** multiple usages occupy the same date/JP/room and are marked as combined (`Iya`, `Ya`, `Yes`, `true`, or `1`).

**Baseline expectation:** room-conflict logic may treat them as one intentional combined activity only when the activities are compatible (current room view also compares mapel).

### CASE 07 — Full-day academic-calendar event

**Setup:** active calendar event covers the date/class with both JP boundaries blank.

**Baseline expectation:** normal KBM for that covered class/date is overridden for the whole day.

### CASE 08 — Partial-JP academic-calendar event

**Setup:** active event for `06 INTER 1 I`, JP 3–6.

**Baseline expectation:** JP 1–2 remain normal; JP 3–6 are covered by the event. Other classes are not affected by a class-scoped event.

### CASE 09 — JP 0

**Setup:** schedule/calendar logic uses JP 0.

**Baseline expectation:** `0` is a real JP value and must never be treated as empty/falsy.

### CASE 10 — Daily teacher load

**Setup:** selected teacher/date contains regular teaching, calendar cancellation, leave, and/or substitute duties.

**Baseline expectation:** daily display is derived for the selected date, with one teacher/date/JP counted at most once when equivalent duplicate assignments represent the same working slot.

### CASE 11 — Weekly teacher load

**Baseline formula currently intended by V3:**

`JP efektif = JP asli - JP kalender - JP izin + JP badal`

A leave must not be subtracted a second time when its underlying slot was already cancelled by the academic calendar.

### CASE 12 — Recommended weekly load threshold

**Baseline expectation:** recommended weekly threshold is **24 JP**. A candidate above the threshold may remain visible but should be warned/de-prioritized rather than silently disappearing solely because of that threshold.

### CASE 13 — Unmatched incidental session

**Setup:** incidental row has no master `kelas + jam_ke` match for the date.

**Baseline expectation:** it can appear as an additional/standalone session rather than being discarded.

### CASE 14 — Unknown room ID

**Setup:** schedule contains a room value not found in `Master Ruangan`.

**Baseline expectation:** UI does not crash or silently substitute another room. Current shared room resolver exposes the raw value with a warning marker.

## Known structural debt intentionally NOT fixed in V3.1

1. There is no single canonical Effective Schedule Engine yet. Dashboard, Inval, and Room views still perform their own merges.
2. `types.ts` mixes interfaces, domain helpers, room/calendar logic, teacher rules, and React rendering helpers.
3. `JAM_TIME_MAP` still lives in `Dashboard.tsx` and is imported by unrelated components.
4. Existing incidental teacher inheritance is inconsistent (`guru1` is guarded more carefully than some `guru2`–`guru6` paths).
5. `JadwalRuangan.tsx` uses `kalenderAkademik` inside the effective-room memo while the current dependency list does not include it, so calendar changes can leave stale derived room data until another dependency changes.
6. Matching logic is duplicated in multiple components, creating divergence risk.
7. Authentication/write authorization remains a separate security debt and is intentionally not changed in this baseline release.
8. The future teacher leave-request → approval → badal waiting-list → task workflow is recorded in the V3 roadmap, but is not implemented in V3.1.

## Exit criteria for V3.1

V3.1 is complete when:

- baseline domain tests pass;
- TypeScript lint/check passes;
- production build passes;
- staging read/write behavior remains unchanged;
- no business logic has been intentionally refactored.

After this point, V3.2 may begin extracting shared foundation modules in small, behavior-preserving patches.
