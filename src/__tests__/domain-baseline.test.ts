import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RECOMMENDED_WEEKLY_JP_LIMIT,
  getAcademicCalendarEvent,
  getAcademicCalendarEventsForDate,
  getRoomDisplayName,
  getSchoolWeekDateStrings,
  hasMeaningfulValue,
  isAcademicCalendarActive,
  isClassCoveredByEvent,
  isClassMatch,
  isGrade1Or2,
  isCombinedClassValue,
  isDateInRange,
  isJpCoveredByEvent,
  isSameDay,
  isWholeDayAcademicEvent,
  matchRoomId,
  normalizeDateString,
  normalizeDay,
  resolveRoomInfo,
  type KalenderAkademikItem,
  type MasterRuanganItem,
} from "../types.ts";

const rooms: MasterRuanganItem[] = [
  {
    id_ruangan: "LABKOM",
    nama_ruangan: "Laboratorium Komputer",
    alias: "Ruang Laboratorium Komputer|Lab Komputer",
    lokasi: "Lantai 3 Gedung A",
    status: "Aktif",
  },
  {
    id_ruangan: "LABIPA",
    nama_ruangan: "Laboratorium Sains",
    alias: "Ruang Laboratorium Science|Lab IPA",
    lokasi: "Lantai 3 Gedung A",
    status: "Aktif",
  },
];

const fullDayEvent: KalenderAkademikItem = {
  id: "LIB-FULL",
  tanggal_mulai: "2026-08-17",
  tanggal_selesai: "2026-08-17",
  nama_kegiatan: "Libur Nasional",
  tipe: "Libur",
  cakupan: "Semua",
  status: "Aktif",
};

const partialClassEvent: KalenderAkademikItem = {
  id: "LIB003A",
  tanggal_mulai: "2026-08-20",
  tanggal_selesai: "2026-08-21",
  nama_kegiatan: "Rumah Tahfidz 1",
  tipe: "Kegiatan Selain KBM Normal",
  cakupan: "Kelas",
  kelas: "06 INTER 1 I",
  jp_mulai: 3,
  jp_selesai: 6,
  status: "Aktif",
};

describe("V3.1 baseline — day normalization", () => {
  it("normalizes Indonesian and English weekday names", () => {
    assert.equal(normalizeDay("Senin"), "Senin");
    assert.equal(normalizeDay(" monday "), "Senin");
    assert.equal(normalizeDay("Jum'at"), "Jumat");
    assert.equal(normalizeDay("friday"), "Jumat");
  });

  it("compares normalized weekdays", () => {
    assert.equal(isSameDay("Monday", "Senin"), true);
    assert.equal(isSameDay("Friday", "Jum'at"), true);
    assert.equal(isSameDay("Rabu", "Kamis"), false);
  });
});

describe("V3.1 baseline — school week", () => {
  it("returns Monday-Friday for a selected Wednesday", () => {
    assert.deepEqual(getSchoolWeekDateStrings("2026-09-23"), [
      { dateStr: "2026-09-21", dayName: "Senin" },
      { dateStr: "2026-09-22", dayName: "Selasa" },
      { dateStr: "2026-09-23", dayName: "Rabu" },
      { dateStr: "2026-09-24", dayName: "Kamis" },
      { dateStr: "2026-09-25", dayName: "Jumat" },
    ]);
  });

  it("maps a Sunday back to the preceding school Monday", () => {
    const week = getSchoolWeekDateStrings("2026-09-27");
    assert.equal(week[0]?.dateStr, "2026-09-21");
    assert.equal(week[4]?.dateStr, "2026-09-25");
  });

  it("returns an empty list for an empty/invalid selection", () => {
    assert.deepEqual(getSchoolWeekDateStrings(""), []);
    assert.deepEqual(getSchoolWeekDateStrings("not-a-date"), []);
  });
});

describe("V3.1 baseline — class matching", () => {
  it("matches identical class names", () => {
    assert.equal(isClassMatch("06 INTER 1 I", "06 INTER 1 I"), true);
  });

  it("ignores Wali/Pendamping/Kelas prefixes", () => {
    assert.equal(isClassMatch("Wali Kelas 06 INTER 1 I", "06 INTER 1 I"), true);
    assert.equal(isClassMatch("Pendamping Kelas 10 AE 1 I", "10 AE 1 I"), true);
  });

  it("normalizes MQ leading zero and MQ order", () => {
    assert.equal(isClassMatch("01 MQ", "1 MQ"), true);
    assert.equal(isClassMatch("MQ 01", "1 MQ"), true);
  });

  it("matches one class inside a combined class field", () => {
    assert.equal(isClassMatch("01 MQ & 02 MQ", "02 MQ"), true);
    assert.equal(isClassMatch("06 INTER 1 I / 06 INTER 2 I", "06 INTER 2 I"), true);
  });

  it("keeps genuinely different classes separate", () => {
    assert.equal(isClassMatch("10 AE 1 I", "10 AE 1 A"), false);
    assert.equal(isClassMatch("06 INTER 1 I", "06 INTER 2 I"), false);
  });
});

describe("V3.2 shared foundation — grade helper", () => {
  it("identifies grade 1 and 2 class names using the existing rule", () => {
    assert.equal(isGrade1Or2("01 INTER 1 I"), true);
    assert.equal(isGrade1Or2("2 MQ"), true);
    assert.equal(isGrade1Or2("Grade 1"), true);
  });

  it("keeps higher grades outside the grade 1/2 rule", () => {
    assert.equal(isGrade1Or2("03 INTER 1 I"), false);
    assert.equal(isGrade1Or2("10 AE 1 I"), false);
  });
});

describe("V3.1 baseline — combined class flags", () => {
  it("recognizes current truthy representations", () => {
    for (const value of ["Iya", "Ya", "Yes", true, 1, " true ", "1"]) {
      assert.equal(isCombinedClassValue(value), true, `Expected ${String(value)} to be combined`);
    }
  });

  it("rejects current false/empty representations", () => {
    for (const value of ["Tidak", "No", false, 0, "", null, undefined]) {
      assert.equal(isCombinedClassValue(value), false, `Expected ${String(value)} not to be combined`);
    }
  });
});

describe("V3.1 baseline — room resolution", () => {
  it("resolves room IDs case-insensitively", () => {
    assert.equal(matchRoomId("LABKOM", rooms), "LABKOM");
    assert.equal(matchRoomId(" labkom ", rooms), "LABKOM");
  });

  it("resolves room display names and aliases", () => {
    assert.equal(getRoomDisplayName("LABKOM", rooms), "Laboratorium Komputer");
    assert.equal(getRoomDisplayName("Lab Komputer", rooms), "Laboratorium Komputer");
    assert.equal(getRoomDisplayName("Lab IPA", rooms), "Laboratorium Sains");
  });

  it("resolves canonical room information from official name", () => {
    const resolved = resolveRoomInfo("Laboratorium Sains", rooms);
    assert.equal(resolved?.id_ruangan, "LABIPA");
    assert.equal(resolved?.nama_ruangan, "Laboratorium Sains");
    assert.equal(resolved?.isKnown, true);
  });

  it("keeps an unknown room as a visible warning instead of crashing", () => {
    const resolved = resolveRoomInfo("ROOM-X", rooms);
    assert.equal(resolved?.id_ruangan, "ROOM-X");
    assert.equal(resolved?.isKnown, false);
    assert.equal(getRoomDisplayName("ROOM-X", rooms), "⚠️ ROOM-X");
  });

  it("uses the supplied fallback for an empty room", () => {
    assert.equal(matchRoomId("", rooms), null);
    assert.equal(getRoomDisplayName("", rooms, "Ruang Reguler"), "Ruang Reguler");
  });

  it("renders multiple comma-separated room IDs using official names", () => {
    assert.equal(
      getRoomDisplayName("LABKOM, LABIPA", rooms),
      "Laboratorium Komputer, Laboratorium Sains",
    );
  });
});

describe("V3.1 baseline — meaningful values", () => {
  it("treats blank-like values as empty but preserves numeric zero", () => {
    assert.equal(hasMeaningfulValue(undefined), false);
    assert.equal(hasMeaningfulValue(null), false);
    assert.equal(hasMeaningfulValue(""), false);
    assert.equal(hasMeaningfulValue("   "), false);
    assert.equal(hasMeaningfulValue(0), true);
    assert.equal(hasMeaningfulValue("LABIPA"), true);
  });
});

describe("V3.1 baseline — date normalization", () => {
  it("normalizes supported date formats", () => {
    assert.equal(normalizeDateString("2026-8-5"), "2026-08-05");
    assert.equal(normalizeDateString("05/08/2026"), "2026-08-05");
    assert.equal(normalizeDateString("2026-08-05T00:00:00.000Z"), "2026-08-05");
  });

  it("checks inclusive date ranges", () => {
    assert.equal(isDateInRange("2026-08-20", "2026-08-20", "2026-08-21"), true);
    assert.equal(isDateInRange("2026-08-21", "2026-08-20", "2026-08-21"), true);
    assert.equal(isDateInRange("2026-08-22", "2026-08-20", "2026-08-21"), false);
  });
});

describe("V3.1 baseline — academic calendar", () => {
  it("treats full-day events as covering every JP", () => {
    assert.equal(isWholeDayAcademicEvent(fullDayEvent), true);
    for (const jp of [0, 1, 2, 3, 4, 5, 6]) {
      assert.equal(isJpCoveredByEvent(fullDayEvent, jp), true);
    }
  });

  it("applies a partial event only to its inclusive JP range", () => {
    assert.equal(isWholeDayAcademicEvent(partialClassEvent), false);
    assert.equal(isJpCoveredByEvent(partialClassEvent, 1), false);
    assert.equal(isJpCoveredByEvent(partialClassEvent, 2), false);
    assert.equal(isJpCoveredByEvent(partialClassEvent, 3), true);
    assert.equal(isJpCoveredByEvent(partialClassEvent, 4), true);
    assert.equal(isJpCoveredByEvent(partialClassEvent, 5), true);
    assert.equal(isJpCoveredByEvent(partialClassEvent, 6), true);
  });

  it("preserves JP 0 as a valid range boundary", () => {
    const jpZeroEvent: KalenderAkademikItem = {
      ...partialClassEvent,
      id: "JP0",
      jp_mulai: 0,
      jp_selesai: 0,
    };
    assert.equal(isWholeDayAcademicEvent(jpZeroEvent), false);
    assert.equal(isJpCoveredByEvent(jpZeroEvent, 0), true);
    assert.equal(isJpCoveredByEvent(jpZeroEvent, 1), false);
  });

  it("rejects a malformed partial event with only one JP boundary", () => {
    const malformed: KalenderAkademikItem = {
      ...partialClassEvent,
      id: "MALFORMED",
      jp_mulai: 3,
      jp_selesai: null,
    };
    assert.equal(isJpCoveredByEvent(malformed, 3), false);
  });

  it("applies class-scoped events only to matching classes", () => {
    assert.equal(isClassCoveredByEvent(partialClassEvent, "06 INTER 1 I"), true);
    assert.equal(isClassCoveredByEvent(partialClassEvent, "06 INTER 2 A"), false);
  });

  it("uses the current safe legacy fallback: blank scope + class means class-specific", () => {
    const legacyEvent: KalenderAkademikItem = {
      ...partialClassEvent,
      id: "LEGACY",
      cakupan: "",
      kelas: "06 INTER 1 I",
    };
    assert.equal(isClassCoveredByEvent(legacyEvent, "06 INTER 1 I"), true);
    assert.equal(isClassCoveredByEvent(legacyEvent, "06 INTER 2 A"), false);
  });

  it("does not interpret blank scope + blank class as global", () => {
    const unsafeBlank: KalenderAkademikItem = {
      ...fullDayEvent,
      id: "BLANK",
      cakupan: "",
      kelas: "",
    };
    assert.equal(isClassCoveredByEvent(unsafeBlank, "06 INTER 1 I"), false);
  });

  it("keeps active-status handling case-insensitive and rejects inactive statuses", () => {
    assert.equal(isAcademicCalendarActive({ ...fullDayEvent, status: "aktif" }), true);
    assert.equal(isAcademicCalendarActive({ ...fullDayEvent, status: "AKTIF" }), true);
    assert.equal(isAcademicCalendarActive({ ...fullDayEvent, status: "Nonaktif" }), false);
    assert.equal(isAcademicCalendarActive({ ...fullDayEvent, status: "Tidak Aktif" }), false);
  });

  it("returns the matching event only for covered date, class, and JP", () => {
    const calendar = [fullDayEvent, partialClassEvent];
    assert.equal(
      getAcademicCalendarEvent("2026-08-20", "06 INTER 1 I", 3, calendar)?.id,
      "LIB003A",
    );
    assert.equal(getAcademicCalendarEvent("2026-08-20", "06 INTER 1 I", 2, calendar), null);
    assert.equal(getAcademicCalendarEvent("2026-08-20", "06 INTER 2 A", 3, calendar), null);
  });

  it("returns all date/class-matching active events before JP filtering", () => {
    const second = { ...partialClassEvent, id: "LIB003B", nama_kegiatan: "Event Kedua" };
    const inactive = { ...partialClassEvent, id: "OFF", status: "Nonaktif" };
    const result = getAcademicCalendarEventsForDate(
      "2026-08-20",
      "06 INTER 1 I",
      [partialClassEvent, second, inactive],
    );
    assert.deepEqual(result.map((event) => event.id), ["LIB003A", "LIB003B"]);
  });
});

describe("V3.1 baseline — policy constants", () => {
  it("keeps the recommended weekly substitute-load threshold at 24 JP", () => {
    assert.equal(RECOMMENDED_WEEKLY_JP_LIMIT, 24);
  });
});
