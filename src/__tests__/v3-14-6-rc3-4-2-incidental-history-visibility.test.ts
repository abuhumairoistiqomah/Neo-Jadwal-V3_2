import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterIncidentalHistory, isPastIncidentalDate } from "../domain/incidentalHistoryVisibility.ts";
import { getSchoolTodayISO } from "../domain/date.ts";

const rows = [
  { id: "yesterday", tanggal: "2026-10-10" },
  { id: "today", tanggal: "2026-10-11" },
  { id: "tomorrow", tanggal: "2026-10-12" },
];

test("past dated incidentals are hidden by default while today and future remain", () => {
  assert.deepEqual(filterIncidentalHistory(rows, "2026-10-11", false).map((row) => row.id), ["today", "tomorrow"]);
});

test("history toggle restores older incidentals without mutating the input", () => {
  const copy = filterIncidentalHistory(rows, "2026-10-11", true);
  assert.equal(copy.length, 3);
  assert.notEqual(copy, rows);
  assert.deepEqual(rows.map((row) => row.id), ["yesterday", "today", "tomorrow"]);
});

test("invalid legacy dates are visible, not silently hidden", () => {
  assert.equal(isPastIncidentalDate("10/10/2026", "2026-10-11"), false);
  assert.equal(isPastIncidentalDate("", "2026-10-11"), false);
});

test("school date is calculated in Asia/Jakarta, independent of machine timezone", () => {
  assert.equal(getSchoolTodayISO(new Date("2026-10-10T18:00:00Z")), "2026-10-11");
});

test("incidental list uses history checkbox without changing repository mutations", () => {
  const ui = readFileSync("src/components/IncidentalScheduleAdmin.tsx", "utf8");
  assert.match(ui, /Lihat yang sudah lewat/);
  assert.match(ui, /displayedIncidentals\.map/);
  assert.match(ui, /filterIncidentalHistory\(sortedIncidentals, schoolToday, showPastIncidentals\)/);
  assert.match(ui, /repo\.deleteScheduleIncidental/);
});

test("timeout RPC and migration 052 are included with prior release", () => {
  const sql = readFileSync("supabase/migrations/202610110052_v3_14_6_calendar_bulk_versioning.sql", "utf8");
  const repo = readFileSync("src/infrastructure/repositories/operationalRulesRepository.ts", "utf8");
  assert.match(sql, /ejadwal_save_academic_event_group_v2/);
  assert.match(sql, /ACADEMIC_EVENT_GROUP_PUBLISH/);
  assert.match(repo, /ejadwal_save_academic_event_group_v2/);
});
