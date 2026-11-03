import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import type { LogIzinItem, ScheduleItem } from "../domain/models";
import { parseScheduleClassMode, scheduleClassModeToLegacy } from "../domain/schedule/classMode";
import {
  classifyJadwalKelasCell,
  findSubstituteLogsForCell,
  hasTeacherConflictForCell,
} from "../domain/schedule/jadwalKelasVisualSemantics";

function schedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: "s1",
    kelas: "06 INTER 1 I",
    hari: "Senin",
    jam_ke: 3,
    mulai: "10:00",
    selesai: "11:00",
    mapel: "Math",
    guru1: "UST. AHMAD",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak",
    ...overrides,
  };
}

function log(overrides: Partial<LogIzinItem> = {}): LogIzinItem {
  return {
    id: "l1",
    tanggal: "2026-10-05",
    guru_izin: "UST. AHMAD",
    alasan: "Izin",
    jam_ke: 3,
    kelas: "06 INTER 1 I",
    mapel: "Math",
    guru_pengganti: "UST. BADAL",
    ...overrides,
  };
}

describe("V3.7.3 class mode preservation", () => {
  it("recognizes legacy combined and alternating values", () => {
    assert.equal(parseScheduleClassMode("Iya"), "COMBINED");
    assert.equal(parseScheduleClassMode("Bergantian"), "ALTERNATING");
    assert.equal(parseScheduleClassMode("Tidak"), "NORMAL");
    assert.equal(scheduleClassModeToLegacy("ALTERNATING"), "Bergantian");
  });
});

describe("V3.7.3 Jadwal Kelas visual semantics", () => {
  it("uses green/combined semantic for combined class", () => {
    const item = schedule({ kelasgabung: "Ya" });
    assert.equal(classifyJadwalKelasCell({
      items: [item], schedules: [item], selectedClass: item.kelas, day: "Senin", period: 3, logs: [], referenceDate: "2026-10-07",
    }), "COMBINED");
  });

  it("uses violet/alternating semantic for Bergantian", () => {
    const item = schedule({ kelasgabung: "Bergantian" });
    assert.equal(classifyJadwalKelasCell({
      items: [item], schedules: [item], selectedClass: item.kelas, day: "Senin", period: 3, logs: [], referenceDate: "2026-10-07",
    }), "ALTERNATING");
  });

  it("does not mark an alternating master row as a static teacher conflict", () => {
    const rotating = schedule({ id: "rot", kelas: "12 AE 3 A", kelasgabung: "Bergantian", mapel: "Arabic/Native Arabic", guru1: "SYAIKH MANSHUR" });
    const weekly = schedule({ id: "weekly", kelas: "09 MQ IKHWAN", kelasgabung: "Tidak", mapel: "Native Arabic", guru1: "SYAIKH MANSHUR" });
    assert.equal(hasTeacherConflictForCell({ items: [rotating], schedules: [rotating, weekly], day: "Senin", period: 3 }), false);
    assert.equal(classifyJadwalKelasCell({
      items: [rotating], schedules: [rotating, weekly], selectedClass: rotating.kelas, day: "Senin", period: 3, logs: [], referenceDate: "2026-10-07",
    }), "ALTERNATING");
  });

  it("detects a teacher overlap across different sessions as conflict", () => {
    const a = schedule({ id: "a", kelas: "06 INTER 1 I", kelasgabung: "Tidak", mapel: "Math" });
    const b = schedule({ id: "b", kelas: "06 INTER 2 I", kelasgabung: "Tidak", mapel: "Science" });
    assert.equal(hasTeacherConflictForCell({ items: [a], schedules: [a, b], day: "Senin", period: 3 }), true);
    assert.equal(classifyJadwalKelasCell({
      items: [a], schedules: [a, b], selectedClass: a.kelas, day: "Senin", period: 3, logs: [], referenceDate: "2026-10-07",
    }), "CONFLICT");
  });


  it("infers legacy combined semantics when same teacher, subject, JP and time match", () => {
    const inter = schedule({ id: "inter", kelas: "05 INTER 1 I", kelasgabung: "Tidak", mapel: "Al-Qur'an" });
    const mq = schedule({ id: "mq", kelas: "05 MQ IKHWAN", kelasgabung: "Ya", mapel: "Al-Qur'an" });
    assert.equal(hasTeacherConflictForCell({ items: [inter], schedules: [inter, mq], day: "Senin", period: 3 }), false);
    assert.equal(classifyJadwalKelasCell({
      items: [inter], schedules: [inter, mq], selectedClass: inter.kelas, day: "Senin", period: 3, logs: [], referenceDate: "2026-10-07",
    }), "COMBINED");
  });

  it("does not call intentional combined classes a conflict", () => {
    const a = schedule({ id: "a", kelas: "06 INTER 1 I", kelasgabung: "Ya" });
    const b = schedule({ id: "b", kelas: "06 INTER 2 I", kelasgabung: "Iya" });
    assert.equal(hasTeacherConflictForCell({ items: [a], schedules: [a, b], day: "Senin", period: 3 }), false);
  });

  it("finds assigned badal only on the matching date/class/JP", () => {
    const logs = [log(), log({ id: "l2", tanggal: "2026-10-06", kelas: "06 INTER 2 I" })];
    const matches = findSubstituteLogsForCell({ logs, selectedClass: "06 INTER 1 I", day: "Senin", period: 3, referenceDate: "2026-10-07" });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].guru_pengganti, "UST. BADAL");
  });

  it("gives assigned badal highest visual priority", () => {
    const a = schedule({ id: "a", kelas: "06 INTER 1 I", kelasgabung: "Tidak" });
    const b = schedule({ id: "b", kelas: "06 INTER 2 I", kelasgabung: "Tidak" });
    assert.equal(classifyJadwalKelasCell({
      items: [a], schedules: [a, b], selectedClass: a.kelas, day: "Senin", period: 3, logs: [log()], referenceDate: "2026-10-07",
    }), "SUBSTITUTE");
  });
});


describe("RC1.7.1 HF4 — class timetable incidental color parity", () => {
  const source = readFileSync(new URL("../components/JadwalKelas.tsx", import.meta.url), "utf8");
  const teacherSource = readFileSync(new URL("../components/JadwalLengkap.tsx", import.meta.url), "utf8");

  it("uses orange for the same incidental status as Jadwal Guru on desktop and mobile", () => {
    assert.match(source, /desktop: "bg-orange-50 text-orange-950 border-l-2 border-l-orange-500/);
    assert.match(source, /mobile: "border-orange-200 bg-orange-50 text-orange-950/);
    assert.match(source, /teacherText: "text-orange-800"/);
    assert.match(source, /periodBadge: "border-orange-200 text-orange-800"/);
    assert.match(teacherSource, /weekStatus === "INSIDENTAL"\)\) cellClasses = "bg-orange-50/);
    assert.doesNotMatch(source, /desktop: "bg-indigo-50\/90 text-indigo-950/);
  });

  it("keeps badal higher priority, and incidental higher priority than alternating", () => {
    const substituteIndex = source.indexOf('if (cell.hasSubstitute)');
    const missingBadalIndex = source.indexOf('else if (cell.hasMissingSubstitute)');
    const incidentalIndex = source.indexOf('else if (cell.isIncidental)');
    const alternatingIndex = source.indexOf('else if (displayItems.some((item) => parseScheduleClassMode(item.kelasgabung) === "ALTERNATING"))');
    assert.ok(substituteIndex >= 0 && substituteIndex < missingBadalIndex);
    assert.ok(missingBadalIndex < incidentalIndex && incidentalIndex < alternatingIndex);
    assert.match(source, /visual = JADWAL_KELAS_CELL_VISUALS\.SUBSTITUTE/);
  });

  it("matches the orange legend and uses one visual object for weekday, Friday, mobile and PNG", () => {
    assert.match(source, /bg-orange-50 border border-orange-300/);
    assert.match(source, /\$\{visual\.desktop\}/g);
    assert.match(source, /\$\{visual\.mobile\}/);
    assert.match(source, /id="timetable-capture-area"/);
    assert.match(source, /downloadElementAsPng\(/);
    assert.match(source, /scheduleViewMode === "MASTER"/);
  });
});
