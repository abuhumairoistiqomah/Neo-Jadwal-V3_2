import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  constraintMatchesSlot,
  getIsoDayOfWeek,
  resolveSubstituteAvailability,
  type SubstituteConstraint,
} from "../domain/substituteAvailability.ts";
import { mapSubstituteConstraintRow } from "../infrastructure/repositories/substituteConstraintMappers.ts";

const weeklyYusril: SubstituteConstraint = {
  id: "constraint-yusril",
  teacherId: "teacher-yusril",
  kind: "WEEKLY",
  dayOfWeek: 1, // Monday
  specificDate: null,
  periodStart: 5,
  periodEnd: 6,
  validFrom: null,
  validUntil: null,
  reason: "Kuliah",
  overrideAllowed: true,
  isActive: true,
};

describe("V3.5.2 substitute availability — date helpers", () => {
  it("uses ISO Monday=1 ... Sunday=7", () => {
    assert.equal(getIsoDayOfWeek("2026-10-05"), 1); // Monday
    assert.equal(getIsoDayOfWeek("2026-10-11"), 7); // Sunday
  });

  it("returns null for invalid dates", () => {
    assert.equal(getIsoDayOfWeek("2026-02-30"), null);
    assert.equal(getIsoDayOfWeek("not-a-date"), null);
  });
});

describe("V3.5.2 substitute availability — recurring constraints", () => {
  it("soft-blocks Yusril on the configured weekly JP range", () => {
    const result = resolveSubstituteAvailability({
      teacherId: "teacher-yusril",
      date: "2026-10-05",
      period: 5,
      constraints: [weeklyYusril],
    });

    assert.equal(result.status, "SOFT_BLOCKED");
    assert.equal(result.requiresOverride, true);
    assert.equal(result.matchingConstraints[0]?.reason, "Kuliah");
  });

  it("keeps the same teacher available outside the blocked JP range", () => {
    assert.equal(
      resolveSubstituteAvailability({
        teacherId: "teacher-yusril",
        date: "2026-10-05",
        period: 4,
        constraints: [weeklyYusril],
      }).status,
      "AVAILABLE",
    );
  });

  it("does not apply a weekday-specific recurring rule on another day", () => {
    assert.equal(
      resolveSubstituteAvailability({
        teacherId: "teacher-yusril",
        date: "2026-10-06", // Tuesday
        period: 5,
        constraints: [weeklyYusril],
      }).status,
      "AVAILABLE",
    );
  });

  it("supports recurring rules that apply every day when dayOfWeek is null", () => {
    const everyDay: SubstituteConstraint = {
      ...weeklyYusril,
      id: "every-day",
      dayOfWeek: null,
    };

    assert.equal(
      resolveSubstituteAvailability({
        teacherId: "teacher-yusril",
        date: "2026-10-06",
        period: 6,
        constraints: [everyDay],
      }).status,
      "SOFT_BLOCKED",
    );
  });

  it("respects validFrom and validUntil for recurring rules", () => {
    const bounded: SubstituteConstraint = {
      ...weeklyYusril,
      dayOfWeek: null,
      validFrom: "2026-10-10",
      validUntil: "2026-10-31",
    };

    assert.equal(
      constraintMatchesSlot(bounded, "teacher-yusril", "2026-10-09", 5),
      false,
    );
    assert.equal(
      constraintMatchesSlot(bounded, "teacher-yusril", "2026-10-10", 5),
      true,
    );
    assert.equal(
      constraintMatchesSlot(bounded, "teacher-yusril", "2026-11-01", 5),
      false,
    );
  });
});

describe("V3.5.2 substitute availability — date-specific constraints", () => {
  it("applies a one-off rule only on its exact date", () => {
    const oneOff: SubstituteConstraint = {
      id: "one-off",
      teacherId: "teacher-a",
      kind: "DATE",
      dayOfWeek: null,
      specificDate: "2026-10-12",
      periodStart: 2,
      periodEnd: 4,
      validFrom: null,
      validUntil: null,
      reason: "Rapat eksternal",
      overrideAllowed: true,
      isActive: true,
    };

    assert.equal(
      resolveSubstituteAvailability({
        teacherId: "teacher-a",
        date: "2026-10-12",
        period: 3,
        constraints: [oneOff],
      }).status,
      "SOFT_BLOCKED",
    );
    assert.equal(
      resolveSubstituteAvailability({
        teacherId: "teacher-a",
        date: "2026-10-13",
        period: 3,
        constraints: [oneOff],
      }).status,
      "AVAILABLE",
    );
  });

  it("preserves JP 0 as a valid constrained period", () => {
    const jpZero: SubstituteConstraint = {
      id: "jp-zero",
      teacherId: "teacher-a",
      kind: "DATE",
      specificDate: "2026-10-12",
      periodStart: 0,
      periodEnd: 0,
      reason: "Morning duty",
      overrideAllowed: true,
      isActive: true,
    };

    assert.equal(
      resolveSubstituteAvailability({
        teacherId: "teacher-a",
        date: "2026-10-12",
        period: 0,
        constraints: [jpZero],
      }).status,
      "SOFT_BLOCKED",
    );
  });
});

describe("V3.5.2 substitute availability — precedence and persistence mapping", () => {
  it("ignores inactive constraints", () => {
    const result = resolveSubstituteAvailability({
      teacherId: "teacher-yusril",
      date: "2026-10-05",
      period: 5,
      constraints: [{ ...weeklyYusril, isActive: false }],
    });
    assert.equal(result.status, "AVAILABLE");
  });

  it("returns HARD_BLOCKED if a future non-overridable rule also matches", () => {
    const result = resolveSubstituteAvailability({
      teacherId: "teacher-yusril",
      date: "2026-10-05",
      period: 5,
      constraints: [weeklyYusril, { ...weeklyYusril, id: "hard", overrideAllowed: false }],
    });

    assert.equal(result.status, "HARD_BLOCKED");
    assert.equal(result.matchingConstraints.length, 2);
  });

  it("maps Supabase rows into the domain contract without losing null weekday semantics", () => {
    const mapped = mapSubstituteConstraintRow({
      id: "db-1",
      teacher_id: "teacher-yusril",
      constraint_type: "WEEKLY",
      day_of_week: null,
      specific_date: null,
      period_start: 5,
      period_end: 6,
      valid_from: "2026-10-01",
      valid_until: null,
      reason: "Kuliah",
      override_allowed: true,
      is_active: true,
    });

    assert.equal(mapped.dayOfWeek, null);
    assert.equal(mapped.periodStart, 5);
    assert.equal(mapped.periodEnd, 6);
    assert.equal(mapped.reason, "Kuliah");
    assert.equal(mapped.overrideAllowed, true);
  });
});
