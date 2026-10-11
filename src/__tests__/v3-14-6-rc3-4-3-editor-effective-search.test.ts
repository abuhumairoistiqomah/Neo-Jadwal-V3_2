import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { buildDatedEditorAvailability } from "../domain/schedule/editorDatedAvailability";
import { rankScheduleEditorTeachers } from "../domain/scheduleEditorCandidate";
import type { ScheduleItem } from "../domain/models";

const make = (id: string, kelas: string, guru: string): ScheduleItem => ({
  id, kelas, guru1: guru, guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  hari: "Senin", jam_ke: 2, mulai: "09:00", selesai: "10:00",
  mapel: "Chemistry", kelasgabung: "Tidak", ruangan: "LAB",
});
const schedules = [make("edit", "06 INTER 1 I", "Guru Target"), make("occupied", "08 AE 1 I", "SALSA BILLA APRIANTI, S.Pd.")];
const teachers = [
  { id: "salsa", full_name: "SALSA BILLA APRIANTI, S.Pd.", is_active: true },
  { id: "other", full_name: "Guru Baru", is_active: true },
];
const rank = (rows: ScheduleItem[]) => rankScheduleEditorTeachers({
  teachers, classNames: ["06 INTER 1 I"], schedules: rows,
  editingScheduleIds: ["edit"], dayName: "Senin", period: 2,
});

test("master still warns when teaching really occurs", () => {
  const dated = buildDatedEditorAvailability({ date: "2026-10-19", schedules });
  assert.equal(rank(dated).find((row) => row.teacher.id === "salsa")?.hasConflict, true);
});

test("Rumah Tahfidz academic event frees teacher on affected date and JP", () => {
  const dated = buildDatedEditorAvailability({
    date: "2026-10-12", schedules,
    kalenderAkademik: [{
      id: "rt", tanggal_mulai: "2026-10-12", tanggal_selesai: "2026-10-12",
      nama_kegiatan: "Rumah Tahfidz 2", tipe: "Kegiatan", cakupan: "Kelas",
      kelas: "08 AE 1 I", jp_mulai: 2, jp_selesai: 2, status: "Aktif",
    }],
  });
  assert.equal(dated.some((row) => row.kelas === "08 AE 1 I"), false);
  assert.equal(rank(dated).find((row) => row.teacher.id === "salsa")?.hasConflict, false);
});

test("dated incidental replaces old teacher in warning calculation", () => {
  const dated = buildDatedEditorAvailability({
    date: "2026-10-12", schedules,
    incidentals: [{
      id: "override", tanggal: "2026-10-12", kelas: "08 AE 1 I", jam_ke: 2,
      mapel: "Gladi Resik", guru1: "Guru Baru", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
      replaceTeachers: true,
    }],
  });
  assert.equal(rank(dated).find((row) => row.teacher.id === "salsa")?.hasConflict, false);
  assert.equal(rank(dated).find((row) => row.teacher.id === "other")?.hasConflict, true);
});

test("a substitute replaces an absent teacher in availability", () => {
  const dated = buildDatedEditorAvailability({
    date: "2026-10-12", schedules,
    logs: [{id: "leave", tanggal: "2026-10-12", guru_izin: "SALSA BILLA APRIANTI, S.Pd.",
      guru_pengganti: "Guru Baru", kelas: "08 AE 1 I", jam_ke: 2, mapel: "Chemistry", alasan: "izin"}],
  });
  assert.equal(rank(dated).find((row) => row.teacher.id === "salsa")?.hasConflict, false);
  assert.equal(rank(dated).find((row) => row.teacher.id === "other")?.hasConflict, true);
});

test("both operational editors wire dated availability and searchable selectors", () => {
  const root = path.join(process.cwd(), "src/components");
  for (const name of ["ScheduleQuickEditor.tsx", "IncidentalScheduleAdmin.tsx"]) {
    const code = fs.readFileSync(path.join(root, name), "utf8");
    assert.match(code, /buildDatedEditorAvailability/);
    assert.match(code, /SearchableSelect/);
    assert.match(code, /kalenderAkademik/);
    assert.match(code, /logs/);
  }
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(app, /<ScheduleQuickEditor[\s\S]*?logs=\{logs\}[\s\S]*?kalenderAkademik=\{kalenderAkademik\}/);
  assert.match(app, /<IncidentalScheduleAdmin[\s\S]*?logs=\{logs\}[\s\S]*?kalenderAkademik=\{kalenderAkademik\}/);
});
