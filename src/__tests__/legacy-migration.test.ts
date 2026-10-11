import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLegacyMigrationPlan,
  extractUrls,
  getDriveFileId,
  inferClassMetadata,
  migrationHasBlockers,
  normalizeClassCode,
  normalizeWhatsappE164,
  sanitizeLegacyPayload,
} from "../infrastructure/migration/legacyMigration";
import { legacyPlanToScheduleSnapshot } from "../infrastructure/migration/legacyPlanSnapshot";

const basePayload = {
  Master_Guru: [
    {
      id: "Master_Guru_1",
      _row_id: "Master_Guru_1",
      nama: "YUSRIL",
      panggilan: "Yusril",
      gender: "Ikhwan",
      whatsapp_e164: "+6281325245858",
      mapel_utama: "Arabic",
      rumpun: "Bahasa",
      jenjang: "SD",
    },
    {
      id: "Master_Guru_2",
      _row_id: "Master_Guru_2",
      nama: "AISYAH",
      gender: "Akhwat",
      whatsapp_e164: "081234567890",
    },
  ],
  Master_Ruangan: [
    {
      id: "Master_Ruangan_1",
      _row_id: "Master_Ruangan_1",
      id_ruangan: "LABKOM",
      nama_ruangan: "Laboratorium Komputer",
      alias: "Lab Komputer|Ruang Laboratorium Komputer",
      kapasitas: 25,
      status: "Aktif",
    },
  ],
  Jadwal: [
    {
      id: "Jadwal_1",
      _row_id: "Jadwal_1",
      kelas: "06 INTER 1 I",
      hari: "Senin",
      jam_ke: 0,
      mulai: "07:00",
      selesai: "07:40",
      mapel: "Arabic",
      guru1: "YUSRIL",
      ruangan: "Lab Komputer",
      kelasgabung: "Tidak",
    },
    {
      id: "Jadwal_2",
      _row_id: "Jadwal_2",
      kelas: "09 MQ AKHWAT",
      hari: "Selasa",
      jam_ke: 2,
      mapel: "Al-Qur'an",
      guru1: "AISYAH",
      kelasgabung: "Ya",
    },
  ],
  Jadwal_Insidental: [
    {
      id: "Jadwal_Insidental_1",
      _row_id: "Jadwal_Insidental_1",
      tanggal: "2026-10-05",
      kelas: "06 INTER 1 I",
      jam_ke: 0,
      mapel: "",
      guru1: "",
      ruangan: "LABKOM",
      alasan: "Room only",
    },
  ],
  Kalender_Akademik: [
    {
      id: "LIB003A",
      _row_id: "Kalender_Akademik_1",
      tanggal_mulai: "2026-10-05",
      tanggal_selesai: "2026-10-05",
      nama_kegiatan: "Kegiatan",
      tipe: "Kegiatan Selain KBM Normal",
      cakupan: "",
      kelas: "06 INTER 1 I",
      jp_mulai: 3,
      jp_selesai: 6,
      status: "Aktif",
    },
  ],
  Log_Izin: [
    {
      id: "Log_Izin_1",
      _row_id: "Log_Izin_1",
      tanggal: "2026-10-05",
      jam_ke: 0,
      guru_izin: "YUSRIL",
      kelas: "06 INTER 1 I",
      mapel: "Arabic",
      guru_pengganti: "AISYAH",
      alasan: "Sakit",
      tugas: "Kerjakan worksheet https://drive.google.com/file/d/FILE_123/view dan https://example.com/info",
    },
  ],
  akun: [{ id: "admin", password: "do-not-migrate" }],
};

describe("V3.6 legacy migration — source sanitization", () => {
  it("drops legacy account payload contents and keeps only the count", () => {
    const source = sanitizeLegacyPayload(basePayload);
    assert.equal(source.ignoredAccountCount, 1);
    assert.equal((source as unknown as Record<string, unknown>).akun, undefined);
  });

  it("preserves all operational arrays", () => {
    const source = sanitizeLegacyPayload(basePayload);
    assert.equal(source.teachers.length, 2);
    assert.equal(source.schedules.length, 2);
    assert.equal(source.logs.length, 1);
    assert.equal(source.rooms.length, 1);
  });
});

describe("V3.6 legacy migration — normalization", () => {
  it("normalizes Indonesian local WhatsApp to E.164", () => {
    assert.equal(normalizeWhatsappE164("081325245858"), "+6281325245858");
  });

  it("keeps +62 E.164 WhatsApp", () => {
    assert.equal(normalizeWhatsappE164("+6281325245858"), "+6281325245858");
  });

  it("rejects malformed WhatsApp", () => {
    assert.equal(normalizeWhatsappE164("abc123"), null);
  });

  it("normalizes class code spacing/case", () => {
    assert.equal(normalizeClassCode(" 06 inter 1 i "), "06 INTER 1 I");
  });

  it("infers AE/INTER/MQ class metadata without teacher-name inference", () => {
    assert.deepEqual(inferClassMetadata("06 INTER 1 I"), { gender: "IKHWAN", gradeLevel: 6, program: "INTER" });
    assert.deepEqual(inferClassMetadata("09 MQ AKHWAT"), { gender: "AKHWAT", gradeLevel: 9, program: "MQ" });
  });
});

describe("V3.6 legacy migration — planner", () => {
  const plan = buildLegacyMigrationPlan(sanitizeLegacyPayload(basePayload));

  it("builds master entities and derived classes", () => {
    assert.equal(plan.teachers.length, 2);
    assert.equal(plan.rooms.length, 1);
    assert.equal(plan.classes.length, 2);
  });

  it("preserves JP 0", () => {
    assert.equal(plan.schedules[0].period, 0);
    assert.equal(plan.coverage[0].period, 0);
  });

  it("resolves room aliases to canonical room IDs", () => {
    assert.equal(plan.schedules[0].roomId, "LABKOM");
  });

  it("preserves combined-class flag", () => {
    assert.equal(plan.schedules[1].isCombined, true);
    assert.equal(plan.schedules[1].classMode, "COMBINED");
  });

  it("preserves Bergantian as an explicit ALTERNATING class mode", () => {
    const payload: any = structuredClone(basePayload);
    payload.Jadwal[0].kelasgabung = "Bergantian";
    const alternatingPlan = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.equal(alternatingPlan.schedules[0].classMode, "ALTERNATING");
    assert.equal(legacyPlanToScheduleSnapshot(alternatingPlan).schedules[0].kelasgabung, "Bergantian");
  });

  it("keeps blank incidental teacher values as inheritance (no override)", () => {
    assert.deepEqual(plan.incidentals[0].teacherNames, ["", "", "", "", "", ""]);
  });

  it("marks matching incidental as OVERRIDE", () => {
    assert.equal(plan.incidentals[0].kind, "OVERRIDE");
  });

  it("uses safe calendar legacy fallback blank scope + class => CLASS", () => {
    assert.equal(plan.academicEvents[0].scope, "CLASS");
    assert.ok(plan.issues.some((issue) => issue.code === "CALENDAR_LEGACY_SCOPE_FALLBACK"));
  });

  it("preserves duplicate business event code separately from migration row identity", () => {
    assert.equal(plan.academicEvents[0].legacyEventCode, "LIB003A");
    assert.equal(plan.academicEvents[0].legacyRowId, "Kalender_Akademik_1");
  });

  it("maps legacy Log_Izin to assigned coverage when substitute exists", () => {
    assert.equal(plan.coverage[0].status, "ASSIGNED");
    assert.equal(plan.coverage[0].absentTeacherName, "YUSRIL");
  });

  it("has no blockers for a valid baseline fixture", () => {
    assert.equal(migrationHasBlockers(plan), false);
  });

  it("blocks unknown nonblank rooms instead of silently losing room data", () => {
    const payload = structuredClone(basePayload);
    payload.Jadwal[0].ruangan = "MYSTERY_ROOM";
    const bad = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.equal(migrationHasBlockers(bad), true);
    assert.ok(bad.issues.some((issue) => issue.code === "UNKNOWN_ROOM"));
  });

  it("blocks duplicate teacher names", () => {
    const payload: any = structuredClone(basePayload);
    payload.Master_Guru.push({ id: "Master_Guru_3", _row_id: "Master_Guru_3", nama: "YUSRIL" });
    const bad = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.ok(bad.issues.some((issue) => issue.code === "DUPLICATE_TEACHER" && issue.severity === "BLOCKING"));
  });

  it("warns but preserves teacher snapshot when schedule references a name outside Master Guru", () => {
    const payload: any = structuredClone(basePayload);
    payload.Jadwal[0].guru2 = "GURU EKSTERNAL";
    const withUnknown = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.ok(withUnknown.issues.some((issue) => issue.code === "TEACHER_REFERENCE_NOT_IN_MASTER"));
    assert.equal(withUnknown.schedules[0].teacherNames[1], "GURU EKSTERNAL");
  });

  it("blocks ambiguous blank calendar scope when class is also blank", () => {
    const payload = structuredClone(basePayload);
    payload.Kalender_Akademik[0].kelas = "";
    const bad = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.ok(bad.issues.some((issue) => issue.code === "CALENDAR_SCOPE_AMBIGUOUS"));
  });
  it("blocks a pre-V3.6 source backend that does not expose _row_id", () => {
    const payload: any = structuredClone(basePayload);
    for (const key of ["Master_Guru", "Master_Ruangan", "Jadwal", "Jadwal_Insidental", "Kalender_Akademik", "Log_Izin"]) {
      payload[key].forEach((row: any) => delete row._row_id);
    }
    const bad = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.ok(bad.issues.some((issue) => issue.code === "SOURCE_BACKEND_PRE_V3_6" && issue.severity === "BLOCKING"));
  });

  it("warns but preserves duplicate legacy coverage identities as separate history rows", () => {
    const payload: any = structuredClone(basePayload);
    payload.Log_Izin.push({ ...payload.Log_Izin[0], id: "Log_Izin_2", _row_id: "Log_Izin_2" });
    const planWithDuplicate = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.equal(planWithDuplicate.coverage.length, 2);
    assert.ok(planWithDuplicate.issues.some((issue) => issue.code === "DUPLICATE_COVERAGE_IDENTITY" && issue.severity === "WARNING"));
    assert.equal(migrationHasBlockers(planWithDuplicate), false);
  });

  it("preserves classless room-only incidentals as room unavailability", () => {
    const payload: any = structuredClone(basePayload);
    payload.Jadwal_Insidental[0] = {
      ...payload.Jadwal_Insidental[0],
      kelas: "",
      mapel: "",
      guru1: "",
      alasan: "Lab dipakai kegiatan lain",
    };
    const roomOnly = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.equal(roomOnly.incidentals.length, 0);
    assert.equal(roomOnly.roomUnavailability.length, 1);
    assert.equal(roomOnly.roomUnavailability[0].roomId, "LABKOM");
    assert.equal(roomOnly.roomUnavailability[0].periodStart, 0);
    assert.ok(roomOnly.issues.some((issue) => issue.code === "INCIDENTAL_ROOM_UNAVAILABILITY" && issue.severity === "WARNING"));
    assert.equal(migrationHasBlockers(roomOnly), false);
  });

  it("keeps classless incidental blocked when it still carries subject/teacher semantics", () => {
    const payload: any = structuredClone(basePayload);
    payload.Jadwal_Insidental[0] = { ...payload.Jadwal_Insidental[0], kelas: "", mapel: "Arabic", guru1: "YUSRIL" };
    const ambiguous = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.ok(ambiguous.issues.some((issue) => issue.code === "INCIDENTAL_CLASS_MISSING" && issue.severity === "BLOCKING"));
  });

  it("preserves historical Log_Izin without class as legacy coverage", () => {
    const payload: any = structuredClone(basePayload);
    payload.Log_Izin[0].kelas = "";
    const incompleteHistory = buildLegacyMigrationPlan(sanitizeLegacyPayload(payload));
    assert.equal(incompleteHistory.coverage.length, 1);
    assert.equal(incompleteHistory.coverage[0].classCode, null);
    assert.ok(incompleteHistory.issues.some((issue) => issue.code === "LOG_CLASS_MISSING_HISTORY" && issue.severity === "WARNING"));
    assert.equal(migrationHasBlockers(incompleteHistory), false);
  });

});

describe("V3.6 legacy migration — task resources", () => {
  it("extracts multiple URLs from legacy task text", () => {
    assert.deepEqual(
      extractUrls("A https://example.com/a B https://drive.google.com/file/d/XYZ/view"),
      ["https://example.com/a", "https://drive.google.com/file/d/XYZ/view"],
    );
  });

  it("extracts Google Drive file ID", () => {
    assert.equal(getDriveFileId("https://drive.google.com/file/d/XYZ_123/view"), "XYZ_123");
    assert.equal(getDriveFileId("https://drive.google.com/open?id=ABC-987"), "ABC-987");
  });
});
