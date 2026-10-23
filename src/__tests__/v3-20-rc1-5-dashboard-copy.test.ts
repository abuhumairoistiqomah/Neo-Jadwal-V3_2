import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildDashboardEffectiveDay, dashboardAvailableTeamTeachingPeers } from "../domain/schedule/dashboardEffectiveDay";
import { previewIncidentalCopy } from "../domain/schedule/incidentalCopy";
import type { ScheduleItem, JadwalInsidentalItem, LogIzinItem } from "../domain/models";

const date = "2026-10-23";
const master: ScheduleItem = {
  id: "master-a", hari: "Jumat", kelas: "04 INTER 2 I", jam_ke: 1,
  mulai: "07:15", selesai: "08:15", mapel: "Al-Qur'an",
  guru1: "ANDIKA DHARMAWAN, S.Ag., M.Pd.", guru2: "MUHAMMAD TSAQIF ABDURRAHMAN, S.Pd.",
  guru3: "FAHMI KHOIRUNAS", guru4: "", guru5: "", guru6: "",
  kelasgabung: "Tidak", ruangan: "R1",
};
const leave: LogIzinItem = {
  id: "badal-andika", tanggal: date, jam_ke: 1, kelas: "04 INTER 2 I", mapel: "Al-Qur'an",
  guru_izin: "ANDIKA DHARMAWAN, S.Ag., M.Pd.", guru_pengganti: "RAFI ILYASA SYUJA, S.Pd.",
  alasan: "Urusan Keluarga",
};

test("RC1.5: dashboard team-teaching badges exclude Andika on leave and show real substitute", () => {
  const [slot] = buildDashboardEffectiveDay({ date, schedules: [master], logs: [leave] });
  assert.equal(slot.scheduledTeachers.includes(leave.guru_izin), true, "master remains intact for audit");
  assert.equal(slot.absentTeachers.includes(leave.guru_izin), true);
  assert.deepEqual(dashboardAvailableTeamTeachingPeers([slot], "MUHAMMAD TSAQIF ABDURRAHMAN, S.Pd."),
    ["FAHMI KHOIRUNAS", "RAFI ILYASA SYUJA, S.Pd."]);
  assert.equal(dashboardAvailableTeamTeachingPeers([slot], "MUHAMMAD TSAQIF ABDURRAHMAN, S.Pd.").includes(leave.guru_izin), false);
});

test("RC1.5: no badal assigned still never lists absent colleague as available", () => {
  const [slot] = buildDashboardEffectiveDay({ date, schedules: [master], logs: [{ ...leave, guru_pengganti: "" }] });
  assert.deepEqual(dashboardAvailableTeamTeachingPeers([slot], "MUHAMMAD TSAQIF ABDURRAHMAN, S.Pd."), ["FAHMI KHOIRUNAS"]);
});

test("RC1.5: leave scoped to exact class and JP, unrelated class unaffected", () => {
  const [slot] = buildDashboardEffectiveDay({ date, schedules: [{ ...master, kelas: "04 INTER 3 I" }], logs: [leave] });
  assert.equal(dashboardAvailableTeamTeachingPeers([slot], "MUHAMMAD TSAQIF ABDURRAHMAN, S.Pd.").includes(leave.guru_izin), true);
});

const incidental: JadwalInsidentalItem = {
  id: "source", tanggal: date, kelas: "12 AE 1", jam_ke: 4, mapel: "Mata Pelajaran Pilihan 1",
  guru1: "Guru belum ditentukan", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  kelasgabung: "Tidak", ruangan: "", keterangan_khusus: "Pemadatan TKA", kind: "ADDITIONAL",
};
const previewBase = {
  date, sourceClass: "12 AE 1", periods: [4,5], targetClasses: ["12 AE 2", "12 MQ IKHWAN"],
  incidentals: [incidental, { ...incidental, id: "source5", jam_ke: 5, mapel: "Mata Pelajaran Pilihan 2" }],
  schedules: [] as ScheduleItem[], overwriteExisting: false, copyTeamToEmpty: false,
};

test("RC1.5: copy preview flags empty slots unless teacher-team copy is explicitly authorized", () => {
  const preview = previewIncidentalCopy(previewBase);
  assert.equal(preview.length, 4);
  assert.equal(preview.every(row => row.status === "BLOCKED_NO_TEACHER"), true);
  const enabled = previewIncidentalCopy({ ...previewBase, copyTeamToEmpty: true });
  assert.equal(enabled.every(row => row.status === "READY_EMPTY_SLOT"), true);
  assert.deepEqual(enabled.map(row => row.subject), [
    "Mata Pelajaran Pilihan 1", "Mata Pelajaran Pilihan 2",
    "Mata Pelajaran Pilihan 1", "Mata Pelajaran Pilihan 2",
  ]);
});

test("RC1.5: copy preview preserves existing target master and does not silently overwrite incidentals", () => {
  const withMaster = { ...previewBase, schedules: [{ ...master, kelas: "12 AE 2", jam_ke: 4 }] };
  const preview = previewIncidentalCopy(withMaster);
  assert.equal(preview[0].status, "READY_EXISTING_MASTER");
  const withExisting = { ...withMaster, incidentals: [...withMaster.incidentals, { ...incidental, id: "target", kelas: "12 AE 2" }] };
  assert.equal(previewIncidentalCopy(withExisting)[0].status, "BLOCKED_EXISTS");
  assert.equal(previewIncidentalCopy({ ...withExisting, overwriteExisting: true })[0].status, "WILL_REPLACE_INCIDENTAL");
});

test("RC1.5: copy preview blocks an existing badal on the target class/JP", () => {
  const preview = previewIncidentalCopy({ ...previewBase, copyTeamToEmpty: true,
    logs: [{ ...leave, kelas: "12 AE 2", jam_ke: 4, coverage_status: "ASSIGNED" }],
  });
  assert.equal(preview[0].status, "BLOCKED_BADAL");
  assert.equal(preview[1].status, "READY_EMPTY_SLOT");
});

test("RC1.5: copy migration is admin-only, atomic, audited, and doesn't mutate weekly master", () => {
  const sql = readFileSync("supabase/migrations/202610230004_v3_20_rc1_5_dashboard_team_copy_incidental.sql", "utf8");
  const dashboard = readFileSync("src/components/Dashboard.tsx", "utf8");
  const admin = readFileSync("src/components/IncidentalScheduleAdmin.tsx", "utf8");
  assert.match(sql, /create or replace function public\.ejadwal_copy_incidental_lessons_v320_rc15/);
  assert.match(sql, /ADMIN_OR_WAKASEK_REQUIRED/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /COPY_TARGET_HAS_ACTIVE_BADAL/);
  assert.match(sql, /COPY_EMPTY_SLOT_REQUIRES_EXPLICIT_TEACHER_COPY/);
  assert.match(sql, /COPY_INCIDENTAL_LESSON_RC15/);
  assert.doesNotMatch(sql, /update public\.schedule_master\b/i);
  assert.match(dashboard, /dashboardAvailableTeamTeachingPeers\(item\.items, selectedTeacher\)/);
  assert.match(admin, /<IncidentalCopyPanel/);
});
