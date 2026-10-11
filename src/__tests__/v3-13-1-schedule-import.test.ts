import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseOriScheduleMatrix, resolveScheduleImport, normalizeImportKey } from "../domain/scheduleImport";

test("ori parser reads day -> class header -> JP rows and follows simple cell references", () => {
  const matrix: unknown[][] = [
    ["", "MONDAY", "", ""],
    ["", "", "1 INTER 1 I", "1 MQ IKHWAN"],
    [1, "07.40-08.40", "MATH (Rizal)", "=C3"],
    [2, "08.40-09.40", "ENGLISH (Bintang)", "AL-QUR'AN (Ukasyah / Syuja')"],
    ["", "TUESDAY", "", ""],
    ["", "", "1 INTER 1 I", "1 MQ IKHWAN"],
    [1, "07.40-08.40", "SCIENCE (Friska)", "SCIENCE (Friska)"],
  ];
  const parsed = parseOriScheduleMatrix(matrix);
  assert.equal(parsed.issues.filter((i) => i.severity === "ERROR").length, 0);
  assert.equal(parsed.rows.length, 6);
  assert.equal(parsed.rows[0].dayName, "Senin");
  assert.equal(parsed.rows[1].rawAssignment, "MATH (Rizal)");
  assert.equal(parsed.rows[1].sourceCell, "D3");
  assert.equal(parsed.rows[4].dayName, "Selasa");
});

test("resolver uses short-name aliases and infers combined sessions before conflict detection", () => {
  const parsed = parseOriScheduleMatrix([
    ["", "MONDAY", "", ""],
    ["", "", "1 INTER 1 I", "1 MQ IKHWAN"],
    [1, "07.40-08.40", "MATH (Rizal)", "MATH (Rizal)"],
  ]);
  const result = resolveScheduleImport({
    parsedRows: parsed.rows,
    parserIssues: parsed.issues,
    teachers: [{ id: "t1", full_name: "MUHAMMAD RIZAL, S.Pd", short_name: "Rizal", legacy_name: null, is_active: true }],
    classes: [
      { id: "c1", code: "1 INTER 1 I", display_name: "1 INTER 1 I", is_active: true },
      { id: "c2", code: "1 MQ IKHWAN", display_name: "1 MQ IKHWAN", is_active: true },
    ],
    currentSchedules: [],
  });
  assert.equal(result.summary.errorCount, 0);
  assert.equal(result.summary.inferredCombinedGroups, 1);
  assert.equal(result.rows.every((row) => row.isCombined), true);
});

test("resolver exposes unknown teacher for manual alias mapping then resolves it", () => {
  const parsed = parseOriScheduleMatrix([
    ["", "MONDAY", ""],
    ["", "", "1 INTER 1 I"],
    [1, "07.40-08.40", "SCIENCE (Tifa)"],
  ]);
  const base = {
    parsedRows: parsed.rows,
    parserIssues: parsed.issues,
    teachers: [{ id: "tifa", full_name: "NAFSI LATIFAH, S.Pd", short_name: null, legacy_name: null, is_active: true }],
    classes: [{ id: "c1", code: "1 INTER 1 I", display_name: "1 INTER 1 I", is_active: true }],
    currentSchedules: [],
  };
  const unresolved = resolveScheduleImport(base);
  assert.deepEqual(unresolved.unresolvedTeacherTokens, ["Tifa"]);
  const resolved = resolveScheduleImport({ ...base, manualTeacherMap: { [normalizeImportKey("Tifa")]: "tifa" } });
  assert.equal(resolved.summary.errorCount, 0);
  assert.equal(resolved.rows[0].teachers[0].teacherName, "NAFSI LATIFAH, S.Pd");
});

test("V3.13.1 migration exposes atomic import and quick-edit RPCs", () => {
  const sql = readFileSync("supabase/migrations/202610090030_v3_13_1_mass_import_connected_editor.sql", "utf8");
  assert.match(sql, /schedule_teacher_aliases/);
  assert.match(sql, /ejadwal_publish_schedule_import_v1/);
  assert.match(sql, /ejadwal_update_schedule_master_v1/);
  assert.match(sql, /SCHEDULE_IMPORT_PUBLISH/);
  assert.match(sql, /SCHEDULE_MASTER_QUICK_EDIT/);
});

test("Dashboard exposes connected canonical quick editor and importer is admin-only", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const dashboard = readFileSync("src/components/Dashboard.tsx", "utf8");
  const importer = readFileSync("src/components/ScheduleMassImporter.tsx", "utf8");
  assert.match(app, /schedule-import/);
  assert.match(app, /ScheduleQuickEditor/);
  assert.match(dashboard, /onEditSchedule/);
  assert.match(dashboard, /Edit/);
  assert.match(importer, /role ADMIN/);
  assert.match(importer, /tab 'ori'/i);
});


test("ori parser blocks malformed teacher parentheses instead of silently importing a teacherless row", () => {
  const matrix = [
    ["", "MONDAY", ""],
    ["", "", "1 INTER 1 I"],
    [1, "07:40 - 08:40", "TAHSIN SYAIKH (SYAIKH ALI / Haikal"],
  ];
  const parsed = parseOriScheduleMatrix(matrix);
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.issues.some((issue) => issue.code === "MALFORMED_ASSIGNMENT"), true);
});


test("V3.13.1 JP-0 migration makes Homeroom a first-class leave/coverage period", () => {
  const sql = readFileSync("supabase/migrations/202610090030_v3_13_1_mass_import_connected_editor.sql", "utf8");
  assert.match(sql, /leave_request_periods_period_check check \(period between 0 and 6\)/i);
  assert.match(sql, /p_period = 0[\s\S]*additional_task[\s\S]*wali/i);
  assert.match(sql, /jsonb_array_length\(p_periods\) > 7/i);
  assert.match(sql, /v_period < 0 or v_period > 6/i);
});

test("mass replace preserves operational JP-0 rows not represented by the ori academic template", () => {
  const sql = readFileSync("supabase/migrations/202610090030_v3_13_1_mass_import_connected_editor.sql", "utf8");
  assert.match(sql, /where is_active = true and deleted_at is null and period between 1 and 6/i);
});
