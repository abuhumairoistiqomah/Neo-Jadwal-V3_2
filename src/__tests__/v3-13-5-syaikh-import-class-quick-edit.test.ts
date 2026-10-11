import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseSyaikhRotationMatrix, resolveSyaikhRotationImport } from "../domain/syaikhRotationImport";
import type { ScheduleItem } from "../domain/models";

const schedules: ScheduleItem[] = [
  {
    id: "sm-1", kelas: "02 INTER 1 I", hari: "Senin", jam_ke: 2, mulai: "08:40", selesai: "09:40",
    mapel: "NATIVE ARABIC", guru1: "AGIL AL GHOZALI, S.Pd.", guru2: "Syaikh Abdul Manshur", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak", ruangan: "R1",
  },
  {
    id: "sm-2", kelas: "02 INTER 3 I", hari: "Selasa", jam_ke: 3, mulai: "10:00", selesai: "11:00",
    mapel: "NATIVE ARABIC", guru1: "Syaikh Abdul Manshur", guru2: "RAZAQ", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Ya", ruangan: "R2",
  },
  {
    id: "sm-3", kelas: "02 MQ IKHWAN", hari: "Selasa", jam_ke: 3, mulai: "10:00", selesai: "11:00",
    mapel: "NATIVE ARABIC", guru1: "Syaikh Abdul Manshur", guru2: "RAZAQ", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Ya", ruangan: "R2",
  },
];

const teachers = [
  { id: "agil", full_name: "AGIL AL GHOZALI, S.Pd.", short_name: "Agil", legacy_name: "AGIL", is_active: true },
  { id: "manshur", full_name: "Syaikh Abdul Manshur", short_name: "Manshur", legacy_name: null, is_active: true },
  { id: "razaq", full_name: "RAZAQ", short_name: "Razaq", legacy_name: null, is_active: true },
];

const classes = [
  { id: "c1", code: "02 INTER 1 I", display_name: "02 INTER 1 I", is_active: true },
  { id: "c2", code: "02 INTER 3 I", display_name: "02 INTER 3 I", is_active: true },
  { id: "c3", code: "02 MQ IKHWAN", display_name: "02 MQ IKHWAN", is_active: true },
];

test("V3.13.5 parses KELAS/PEKAN rotation matrix and cross-month ranges", () => {
  const parsed = parseSyaikhRotationMatrix([
    ["", "KELAS/ PEKAN", "28 SEP - 2 OCT", "5 - 9 OCT"],
    ["", "02 INTER 1 I", "NATIVE ARABIC", "NORMAL"],
  ], 2026);
  assert.equal(parsed.issues.filter((issue) => issue.severity === "ERROR").length, 0);
  assert.equal(parsed.cells.length, 2);
  assert.equal(parsed.cells[0].weekStart, "2026-09-28");
  assert.equal(parsed.cells[0].weekEnd, "2026-10-02");
  assert.equal(parsed.cells[1].status, "NORMAL");
});

test("V3.13.5 NORMAL removes Syaikh but preserves companion teacher", () => {
  const parsed = parseSyaikhRotationMatrix([
    ["", "KELAS/ PEKAN", "12 - 16 OCT"],
    ["", "02 INTER 1 I", "NORMAL"],
  ], 2026);
  const result = resolveSyaikhRotationImport({ parsed, schedules, teachers, classes, selectedSyaikhId: "manshur", subjectMatcher: "NATIVE ARABIC" });
  assert.equal(result.summary.errorCount, 0);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].teacherIds, ["agil"]);
  assert.deepEqual(result.rows[0].teacherNames, ["AGIL AL GHOZALI, S.Pd."]);
  assert.equal(result.rows[0].scheduleDate, "2026-10-12");
});

test("V3.13.5 explicit combined class rotation publishes both canonical rows on one date/JP", () => {
  const parsed = parseSyaikhRotationMatrix([
    ["", "KELAS/ PEKAN", "12 - 16 OCT"],
    ["", "02 INTER 3 I + 02 MQ IKHWAN", "NATIVE ARABIC"],
  ], 2026);
  const result = resolveSyaikhRotationImport({ parsed, schedules, teachers, classes, selectedSyaikhId: "manshur", subjectMatcher: "NATIVE ARABIC" });
  assert.equal(result.summary.errorCount, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(new Set(result.rows.map((row) => `${row.scheduleDate}|${row.period}`)).size, 1);
  assert.equal(result.rows.every((row) => row.isCombined), true);
});

test("V3.13.5 class timetable is wired to the same canonical ScheduleQuickEditor", () => {
  const root = process.cwd();
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/components/JadwalKelas.tsx"), "utf8");
  assert.match(app, /<JadwalKelas[\s\S]*onEditSchedule=\{\(items(?:,\s*options)?\) => setScheduleEditorState\(\{\s*items(?:,\s*initialDate:\s*options\?\.initialDate)?\s*\}\)\}/);
  assert.match(page, /Quick Edit — permanen atau insidental/);
  assert.match(page, /Quick Edit Jadwal/);
});

test("V3.13.5 migration publishes rotations through the canonical incidental mutation function", () => {
  const sql = fs.readFileSync("supabase/migrations/202610100040_v3_13_5_syaikh_rotation_import.sql", "utf8");
  assert.match(sql, /ejadwal_publish_syaikh_rotation_v1/);
  assert.match(sql, /ejadwal_upsert_schedule_incidental_v1/);
  assert.match(sql, /INCIDENTAL_SLOT_OWNED_BY_OTHER_CHANGE/);
  assert.match(sql, /SYAIKH_ROTATION_IMPORT_PUBLISH/);
});
