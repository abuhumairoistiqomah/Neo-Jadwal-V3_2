import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterOperationalHistory, isPastAcademicEvent, isPastSubstituteRule } from "../domain/operationalHistoryVisibility";
import { getTeacherUnavailableStatus } from "../domain/dashboardTeacherUnavailable";
import type { SubstituteConstraint } from "../domain/substituteAvailability";

const today = "2026-10-11";
test("calendar hides ended events only and history can be revealed", () => {
  const rows = [
    { dateStart: "2026-10-08", dateEnd: "2026-10-10" },
    { dateStart: "2026-10-11", dateEnd: "2026-10-11" },
    { dateStart: "2026-10-12", dateEnd: "2026-10-13" },
  ];
  assert.deepEqual(filterOperationalHistory(rows, r => isPastAcademicEvent(r, today), false), rows.slice(1));
  assert.equal(filterOperationalHistory(rows, r => isPastAcademicEvent(r, today), true).length, 3);
});

test("expired dated restrictions are hidden; recurring unbounded restrictions remain", () => {
  const rules = [
    { constraint_type: "DATE", specific_date: "2026-10-10", valid_until: null },
    { constraint_type: "DATE", specific_date: "2026-10-11", valid_until: null },
    { constraint_type: "WEEKLY", specific_date: null, valid_until: "2026-10-10" },
    { constraint_type: "WEEKLY", specific_date: null, valid_until: null },
  ] as const;
  assert.equal(isPastSubstituteRule(rules[0], today), true);
  assert.equal(isPastSubstituteRule(rules[1], today), false);
  assert.equal(isPastSubstituteRule(rules[2], today), true);
  assert.equal(isPastSubstituteRule(rules[3], today), false);
});

const assignment: SubstituteConstraint = {
  id: "c1", teacherId: "teacher-muhibah", kind: "DATE",
  specificDate: "2026-10-12", periodStart: 3, periodEnd: 6,
  isActive: true, blocksNormalTeaching: true, overrideAllowed: false,
  reason: "Panitia Outing Class", 
};

test("teacher undertaking outing committee duties is red from JP3, not JP2", () => {
  const input = { teacherId: "teacher-muhibah", teacherName: "MUHIBAH", date: "2026-10-12", constraints: [assignment], logs: [] };
  assert.deepEqual(getTeacherUnavailableStatus({ ...input, period: 2 }), { unavailable: false, cause: null });
  assert.deepEqual(getTeacherUnavailableStatus({ ...input, period: 3 }), { unavailable: true, cause: "ASSIGNMENT" });
  assert.deepEqual(getTeacherUnavailableStatus({ ...input, period: 6 }), { unavailable: true, cause: "ASSIGNMENT" });
  assert.deepEqual(getTeacherUnavailableStatus({ ...input, date: "2026-10-13", period: 3 }), { unavailable: false, cause: null });
});

test("leave log also marks scheduled teacher unavailable without rule", () => {
  const logs = [{ tanggal: "2026-10-12", jam_ke: 4, guru_izin: "MUHIBAH" }] as any;
  assert.equal(getTeacherUnavailableStatus({ teacherName: "muhibah", date: "2026-10-12", period: 4, constraints: [], logs }).cause, "LEAVE");
});

test("guest task completion menu can always open; badge count remains informative", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /missingTeacherTaskCount > 0/);
  assert.doesNotMatch(app, /id: "lengkapi-tugas"[^\n]*disabled:/);
  assert.match(app, /activePage === "lengkapi-tugas"/);
});

test("calendar and badal admin pages use reversible non-destructive history filter", () => {
  const calendar = readFileSync("src/components/AcademicCalendarAdmin.tsx", "utf8");
  const badal = readFileSync("src/components/SubstituteConstraintAdmin.tsx", "utf8");
  for (const component of [calendar, badal]) {
    assert.match(component, /Lihat yang sudah lewat/);
    assert.match(component, /filterOperationalHistory/);
  }
});

test("dashboard status uses restrictions or leave logs and does not infer teacher absence solely from calendar", () => {
  const ui = readFileSync("src/components/Dashboard.tsx", "utf8");
  assert.match(ui, /getTeacherUnavailableStatus/);
  assert.match(ui, /teacherUnavailable\.unavailable/);
  assert.match(ui, /Tidak mengajar normal/);
});

test("logout clears staff-only constraints rather than leaking status into guest views", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /handleAdminLogout[\s\S]*?setSubstituteConstraints\(\[\]\)/);
});
