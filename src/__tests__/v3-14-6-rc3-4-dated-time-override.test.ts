import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildEffectiveScheduleForDate } from "../domain/schedule/effectiveSchedule.ts";
import { timeForInput, validateDatedTimeOverride } from "../domain/schedule/datedTimeOverride.ts";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models.ts";

const master: ScheduleItem = {
  id: "M-JP2", kelas: "12 MQ AKHWAT", hari: "Senin", jam_ke: 2,
  mulai: "09:00", selesai: "10:00", mapel: "Ekonomi", guru1: "Guru Ekonomi",
  guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  ruangan: "RSG", kelasgabung: "Tidak",
};
const incidental: JadwalInsidentalItem = {
  id: "I-JP2", kelas: master.kelas, tanggal: "2026-10-12", jam_ke: 2,
  mapel: "Gladi Resik TKA", guru1: "Pengawas Dini", guru2: "", guru3: "",
  guru4: "", guru5: "", guru6: "", replaceTeachers: true,
  mulai: "09:20", selesai: "10:20", ruangan: "RSG", kelasgabung: "Tidak",
};

test("RC3.4: time override applies only to specified class/date/JP", () => {
  const date = buildEffectiveScheduleForDate({date:"2026-10-12", schedules:[master], jadwalInsidental:[incidental]});
  assert.equal(date.length, 1);
  assert.equal(date[0].source, "INCIDENTAL_OVERRIDE");
  assert.equal(date[0].mulai, "09:20");
  assert.equal(date[0].selesai, "10:20");
  assert.equal(date[0].mapel, "Gladi Resik TKA");
  assert.equal(master.mulai, "09:00");
  const nextMonday = buildEffectiveScheduleForDate({date:"2026-10-19", schedules:[master], jadwalInsidental:[incidental]});
  assert.equal(nextMonday[0].mulai, "09:00");
  assert.equal(nextMonday[0].selesai, "10:00");
});

test("RC3.4: no dated clock means inherit master time", () => {
  const rows = buildEffectiveScheduleForDate({ date: "2026-10-12", schedules: [master],
    jadwalInsidental: [{...incidental, mulai: "", selesai: ""}]});
  assert.equal(rows[0].mulai, master.mulai);
  assert.equal(rows[0].selesai, master.selesai);
});

test("RC3.4: a room-only incidental can also adjust time without replacing teachers", () => {
  const rows = buildEffectiveScheduleForDate({ date: "2026-10-12", schedules: [master],
    jadwalInsidental: [{...incidental, mapel:"", guru1:"", replaceTeachers:false, ruangan:"LABKOM"}]});
  assert.equal(rows[0].mapel, "Ekonomi");
  assert.deepEqual(rows[0].scheduledTeachers, ["Guru Ekonomi"]);
  assert.equal(rows[0].ruangan, "LABKOM");
  assert.equal(rows[0].mulai, "09:20");
});

test("RC3.4: additional incidental without master respects explicit clock", () => {
  const extra = {...incidental, id:"I-JP3", jam_ke:3, mulai:"10:45", selesai:"11:45"};
  const rows = buildEffectiveScheduleForDate({ date:"2026-10-12", schedules: [master], jadwalInsidental:[extra]});
  const result = rows.find(row=>row.jam_ke===3);
  assert.ok(result);
  assert.equal(result.source,"INCIDENTAL_ADDITIONAL");
  assert.equal(result.mulai,"10:45");
  assert.equal(result.selesai,"11:45");
});

test("RC3.4: time helper rejects partial or inverted clock and formats Supabase time", () => {
  assert.equal(timeForInput("09:20:00"), "09:20");
  assert.equal(validateDatedTimeOverride("09:20", "10:20"), null);
  assert.match(validateDatedTimeOverride("09:20", "") || "", /Isi jam/);
  assert.match(validateDatedTimeOverride("10:20", "09:20") || "", /lebih besar/);
  assert.equal(validateDatedTimeOverride("", ""), null);
});

test("RC3.4: UI, Supabase RPC and SQL migration are wired to dated-time fields", () => {
  const source = (relative: string) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  const quick = source("../components/ScheduleQuickEditor.tsx");
  const incidentalUI = source("../components/IncidentalScheduleAdmin.tsx");
  const repository = source("../infrastructure/repositories/scheduleAdminRepository.ts");
  const mapper = source("../infrastructure/repositories/supabaseScheduleMappers.ts");
  const dashboard = source("../components/Dashboard.tsx");
  const migration = source("../../supabase/migrations/202610110004_v3_14_6_dated_time_overrides.sql");
  assert.match(quick, /Atur jam khusus tanggal ini/);
  assert.match(incidentalUI, /Ubah pukul khusus tanggal ini/);
  assert.match(repository, /ejadwal_upsert_schedule_incidental_session_v3/);
  assert.match(repository, /ejadwal_upsert_schedule_incidental_v3/);
  assert.match(repository, /p_start_time: args\.startTime/);
  assert.match(repository, /p_end_time: input\.endTime/);
  assert.match(mapper, /override_start_time/);
  assert.match(dashboard, /datedSlot/);
  assert.match(migration, /schedule_incidentals_dated_time_pair_ck/);
  assert.match(migration, /p_start_time time without time zone/);
});
