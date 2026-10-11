import assert from "node:assert/strict";
import test from "node:test";
import type { EffectiveScheduleItem } from "../domain/schedule/effectiveSchedule";
import {
  expandInvalSessionRowsForPersistence,
  groupInvalScheduleItems,
} from "../domain/inval/sessionGrouping";

function slot(overrides: Partial<EffectiveScheduleItem>): EffectiveScheduleItem {
  return {
    id: "s1",
    kelas: "05 MQ IKHWAN",
    hari: "Kamis",
    jam_ke: 3,
    mulai: "10:00",
    selesai: "11:00",
    mapel: "Tahsin",
    guru1: "Guru A",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Ya",
    ruangan: "RSG",
    tanggal: "2026-10-08",
    source: "MASTER",
    scheduledTeachers: ["Guru A"],
    absentTeachers: [],
    substituteTeachers: [],
    effectiveTeachers: ["Guru A"],
    substitutions: [],
    logIds: [],
    academicEvent: null,
    isSuppressedByAcademicCalendar: false,
    isActive: true,
    ...overrides,
  };
}

test("V3.12.0.1 groups explicit combined classes into one operator row", () => {
  const groups = groupInvalScheduleItems([
    slot({ id: "i", kelas: "05 MQ IKHWAN" }),
    slot({ id: "a", kelas: "05 MQ AKHWAT" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kelas, "05 MQ IKHWAN + 05 MQ AKHWAT");
  assert.equal(groups[0]?.isCombinedGroup, true);
  assert.equal(groups[0]?.recommendationClassLabel, "MIXED");
  assert.deepEqual(groups[0]?.targetSlots.map((item) => item.kelas), [
    "05 MQ IKHWAN",
    "05 MQ AKHWAT",
  ]);
});

test("V3.12.1 infers a combined session from same JP/time + subject + teacher", () => {
  const groups = groupInvalScheduleItems([
    slot({ id: "1", kelas: "05 INTER 1 I", kelasgabung: "Tidak" }),
    slot({ id: "2", kelas: "05 MQ IKHWAN", kelasgabung: "Ya" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.isCombinedGroup, true);
  assert.deepEqual(groups[0]?.targetSlots.map((item) => item.kelas), ["05 INTER 1 I", "05 MQ IKHWAN"]);
});

test("V3.12.1 keeps same-period rows separate when the subject differs", () => {
  const groups = groupInvalScheduleItems([
    slot({ id: "1", kelas: "05 INTER 1 I", kelasgabung: "Tidak", mapel: "Tahsin" }),
    slot({ id: "2", kelas: "05 INTER 2 I", kelasgabung: "Tidak", mapel: "Tahfidz" }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups.every((group) => group.targetSlots.length === 1), true);
});

test("V3.12.0.1 keeps combined rows separate when subject differs but permits different room records", () => {
  const groups = groupInvalScheduleItems([
    slot({ id: "1", kelas: "05 MQ IKHWAN", mapel: "Tahsin", ruangan: "RSG" }),
    slot({ id: "2", kelas: "05 MQ AKHWAT", mapel: "Tahsin", ruangan: "PERPUS" }),
    slot({ id: "3", kelas: "05 MQ AKHWAT 2", mapel: "Tahfidz", ruangan: "PERPUS" }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.mapel === "Tahsin")?.targetSlots.length, 2);
});

test("V3.12.0.1 expands one grouped UI row into one persisted row per real class", () => {
  const expanded = expandInvalSessionRowsForPersistence({
    tanggal: "2026-10-08",
    guruIzin: "Guru A",
    alasan: "Izin",
    rows: [{
      jam_ke: 3,
      kelas: "05 MQ IKHWAN + 05 MQ AKHWAT",
      mapel: "Tahsin",
      selectedPengganti: "Guru B",
      tugas: "Halaman 10",
      constraintOverrideIds: ["constraint-1"],
      targetSlots: [
        { kelas: "05 MQ IKHWAN", mapel: "Tahsin" },
        { kelas: "05 MQ AKHWAT", mapel: "Tahsin" },
      ],
    }],
  });

  assert.equal(expanded.length, 2);
  assert.deepEqual(expanded.map((item) => item.log.kelas), ["05 MQ IKHWAN", "05 MQ AKHWAT"]);
  assert.equal(expanded.every((item) => item.log.guru_pengganti === "Guru B"), true);
  assert.equal(expanded.every((item) => item.log.jam_ke === 3), true);
  assert.deepEqual(expanded[0]?.constraintOverrideIds, ["constraint-1"]);
  assert.deepEqual(expanded[1]?.constraintOverrideIds, ["constraint-1"]);
});
