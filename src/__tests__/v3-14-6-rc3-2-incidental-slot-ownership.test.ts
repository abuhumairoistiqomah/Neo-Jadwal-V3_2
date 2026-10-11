import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildDashboardEffectiveDay, getDashboardClassSlotItems } from "../domain/schedule/dashboardEffectiveDay.ts";
import { buildEffectiveScheduleForDate } from "../domain/schedule/effectiveSchedule.ts";
import { isClassMatch } from "../domain/class.ts";
import type { JadwalInsidentalItem, ScheduleItem, LogIzinItem } from "../domain/models.ts";

const date = "2026-10-12";
const master = (id: string, kelas: string, mapel: string, guru: string): ScheduleItem => ({
  id, kelas, mapel, guru1: guru, guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  hari: "Senin", jam_ke: 1, mulai: "07:40", selesai: "08:40", kelasgabung: "Tidak", ruangan: "R-AWAL",
});
const incident = (overrides: Partial<JadwalInsidentalItem> = {}): JadwalInsidentalItem => ({
  id: "INC-1", tanggal: date, kelas: "12 AE 3 A & 12 MQ AKHWAT", jam_ke: 1,
  mapel: "Gladi Resik TKA", guru1: "Pengawas Dini", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  replaceTeachers: true, kelasgabung: "Ya", ruangan: "RSG", alasan: "Simulasi TKA", tipe_insidental: "Perubahan Jadwal",
  ...overrides,
});

const masters = [master("A", "12 AE 3 A", "Fisika", "Guru Fisika"), master("B", "12 MQ AKHWAT", "Ekonomi", "Guru Ekonomi")];

test("RC3.2: combined incidental claims AE and MQ JP1 despite unrelated master subjects", () => {
  const day = buildDashboardEffectiveDay({ date, schedules: masters, jadwalInsidental: [incident()] });
  assert.equal(day.length, 2);
  for (const className of ["12 AE 3 A", "12 MQ AKHWAT"]) {
    const rows = getDashboardClassSlotItems(day, className, 1);
    assert.equal(rows.length, 1, `Exactly one effective occupant of ${className} JP1`);
    assert.equal(rows[0].source, "INCIDENTAL_OVERRIDE");
    assert.equal(rows[0].kelas, className, "A combined incidental must preserve each concrete class identity");
    assert.equal(rows[0].mapel, "Gladi Resik TKA");
    assert.deepEqual(rows[0].scheduledTeachers, ["Pengawas Dini"]);
    assert.equal(rows[0].ruangan, "RSG");
    assert.equal(rows[0].isOverridden, true);
    assert.equal(rows[0].alasan_insidental, "Simulasi TKA");
  }
  assert.equal(day.some(row => ["Guru Fisika", "Guru Ekonomi"].includes(row.guru1)), false);
  assert.deepEqual(masters.map(row => row.mapel), ["Fisika", "Ekonomi"], "Master remains unchanged");
});

test("RC3.2: old teacher's leave record cannot revive a replaced teacher or substitute", () => {
  const leave: LogIzinItem = { id: "L1", tanggal: date, kelas: "12 MQ AKHWAT", jam_ke: 1,
    guru_izin: "Guru Ekonomi", guru_pengganti: "Guru Badal Ekonomi", alasan: "Izin", mapel: "Ekonomi" };
  const day = buildDashboardEffectiveDay({ date, schedules: masters, jadwalInsidental: [incident()], logs: [leave] });
  const [mq] = getDashboardClassSlotItems(day, "12 MQ AKHWAT", 1);
  assert.deepEqual(mq.effectiveTeachers, ["Pengawas Dini"]);
  assert.deepEqual(mq.absentTeachers, []);
  assert.deepEqual(mq.substituteTeachers, []);
});

test("RC3.2: room-only relocation inherits teachers and original subject", () => {
  const day = buildDashboardEffectiveDay({ date, schedules: [masters[1]],
    jadwalInsidental: [incident({kelas: "12 MQ AKHWAT", mapel: "", guru1: "", replaceTeachers: false, ruangan: "LABKOM"})] });
  const [mq] = getDashboardClassSlotItems(day, "12 MQ AKHWAT", 1);
  assert.equal(mq.mapel, "Ekonomi");
  assert.deepEqual(mq.scheduledTeachers, ["Guru Ekonomi"]);
  assert.equal(mq.ruangan, "LABKOM");
});

test("RC3.2: duplicate master rows for same class+JP collapse into one dated incidental", () => {
  const duplicates = [masters[1], master("B2", "12 MQ AKHWAT", "Kimia", "Guru Kimia")];
  const rows = buildEffectiveScheduleForDate({date, schedules: duplicates,
    jadwalInsidental: [incident({kelas: "12 MQ AKHWAT"})]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "INCIDENTAL_OVERRIDE");
  assert.equal(rows[0].mapel, "Gladi Resik TKA");
});

test("RC3.2: pure master slots remain master; unrelated date does not override", () => {
  const rows = buildDashboardEffectiveDay({ date, schedules: masters, jadwalInsidental: [incident({tanggal: "2026-10-13"})] });
  assert.deepEqual(rows.map(row => row.mapel), ["Fisika", "Ekonomi"]);
  assert.ok(rows.every(row => row.source === "MASTER"));
});

test("RC3.2: combined class delimiter '+' also matches separate class identities", () => {
  assert.equal(isClassMatch("12 AE 3 A + 12 MQ AKHWAT", "12 MQ AKHWAT"), true);
});

test("RC3.2: Dashboard no longer independently merges raw incidental and raw master teachers", () => {
  const ui = fs.readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(ui, /buildDashboardEffectiveDay\(/);
  assert.match(ui, /getDashboardClassSlotItems\(/);
  assert.doesNotMatch(ui, /periodIncidentalItems\.forEach\(/);
  assert.doesNotMatch(ui, /todaysIncidentals\.find\(/);
});
