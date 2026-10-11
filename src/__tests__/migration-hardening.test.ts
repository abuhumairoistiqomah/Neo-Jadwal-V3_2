import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareLegacyManagedTotals } from "../infrastructure/migration/legacyMigrationVerification";

const expected = {
  schedules: 1682,
  incidentals: 705,
  academicEvents: 249,
  coverageSlots: 960,
  roomUnavailability: 0,
};

describe("V3.6.2 migration hardening — managed legacy totals", () => {
  it("passes when every migration-managed total matches the source snapshot", () => {
    assert.deepEqual(compareLegacyManagedTotals(expected, { ...expected }), []);
  });

  it("detects stale LEGACY_IMPORT coverage rows even when current keyed rows exist", () => {
    const differences = compareLegacyManagedTotals(expected, { ...expected, coverageSlots: 961 });
    assert.equal(differences.length, 1);
    assert.match(differences[0], /LEGACY_IMPORT coverage_slots total: expected 960, actual 961/);
  });

  it("detects stale legacy schedule rows", () => {
    const differences = compareLegacyManagedTotals(expected, { ...expected, schedules: 1683 });
    assert.equal(differences.length, 1);
    assert.match(differences[0], /legacy schedule_master total: expected 1682, actual 1683/);
  });
});
