import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teacherWeekDays, buildTeacherWeeklyView } from "../domain/schedule/teacherWeeklyView";
import { findOfficialDutyNeeds, isOfficialDutyRuleDate, summarizeOfficialDutyCoverage } from "../domain/officialDutyBadal";
import type { ScheduleItem, KalenderAkademikItem } from "../domain/models";

const rows: ScheduleItem[] = [{
  id:"s1",kelas:"09 AE 1 I",hari:"Senin",jam_ke:2,mulai:"08:40",selesai:"09:40",mapel:"English",
  guru1:"GURU A",guru2:"",guru3:"",guru4:"",guru5:"",guru6:"",kelasgabung:"Tidak",
}];
const rule = { teacher_id:"id-a",constraint_type:"DATE" as const,specific_date:"2026-10-19",day_of_week:null,
  period_start:2,period_end:4,valid_from:null,valid_until:null,blocks_normal_teaching:true,
  requires_badal:true,is_active:true,reason:"Panitia Survei Field Trip" };

test("weekly teacher view defaults to next week on Jakarta Saturday/Sunday", () => {
  assert.equal(teacherWeekDays("2026-10-17")[0].dateStr,"2026-10-19");
  assert.equal(teacherWeekDays("2026-10-18")[0].dateStr,"2026-10-19");
  assert.equal(teacherWeekDays("2026-10-16")[0].dateStr,"2026-10-12");
  assert.equal(teacherWeekDays("2026-10-17",1)[0].dateStr,"2026-10-26");
});

test("normal mode uses master; dated mode respects explicit dated teacher replacement", () => {
  const weekDays=teacherWeekDays("2026-10-17");
  const incidental = {id:"i1",tanggal:"2026-10-19",kelas:"09 AE 1 I",jam_ke:2,mapel:"Math",
    guru1:"GURU B",guru2:"",guru3:"",guru4:"",guru5:"",guru6:"",replaceTeachers:true,
    kelasgabung:"Tidak",alasan:"Persiapan Ujian"};
  assert.equal(buildTeacherWeeklyView({teacher:"GURU A",mode:"MASTER",weekDays,schedules:rows}).length,1);
  assert.equal(buildTeacherWeeklyView({teacher:"GURU A",mode:"EFFECTIVE",weekDays,schedules:rows,incidentals:[incidental]}).length,0);
  const result = buildTeacherWeeklyView({teacher:"GURU B",mode:"EFFECTIVE",weekDays,schedules:rows,incidentals:[incidental]});
  assert.equal(result.length,1);assert.equal(result[0].weekStatus,"INSIDENTAL");assert.equal(result[0].mapel,"Math");
});

test("calendar cancellation is not treated as active teaching or a badal requirement", () => {
  const calendar: KalenderAkademikItem[] = [{id:"c",tanggal_mulai:"2026-10-19",tanggal_selesai:"2026-10-19",
    nama_kegiatan:"Outing Class",tipe:"Kegiatan",cakupan:"Semua",jp_mulai:1,jp_selesai:6,status:"Aktif"}];
  const needs=findOfficialDutyNeeds({date:"2026-10-19",teacherName:"GURU A",rule,schedules:rows,calendar});
  assert.equal(needs.length,0);
  const weekDays=teacherWeekDays("2026-10-17");
  const view=buildTeacherWeeklyView({teacher:"GURU A",mode:"EFFECTIVE",weekDays,schedules:rows,calendar});
  assert.equal(view.length,1);
  assert.equal(view[0].weekStatus,"KALENDER");
});

test("official duty is constrained to exact date/JP and never auto-repeats", () => {
  assert.ok(isOfficialDutyRuleDate(rule,"2026-10-19"));
  assert.equal(isOfficialDutyRuleDate(rule,"2026-10-26"),false);
  const needs=findOfficialDutyNeeds({date:"2026-10-19",teacherName:"GURU A",rule,schedules:rows});
  assert.deepEqual(needs.map(n=>[n.period,n.className]),[[2,"09 AE 1 I"]]);
  assert.equal(findOfficialDutyNeeds({date:"2026-10-26",teacherName:"GURU A",rule,schedules:rows}).length,0);
});

test("official-duty coverage is shown as school assignment, not personal leave", () => {
  const result=buildTeacherWeeklyView({teacher:"GURU A",mode:"EFFECTIVE",weekDays:teacherWeekDays("2026-10-17"),schedules:rows,
    logs:[{id:"cov",tanggal:"2026-10-19",kelas:"09 AE 1 I",jam_ke:2,mapel:"English",guru_izin:"GURU A",guru_pengganti:"GURU B",alasan:"Panitia Survei Field Trip",source:"OFFICIAL_DUTY"}]});
  assert.equal(result[0].weekStatus,"TUGAS_RESMI");
  assert.match(result[0].weekDetail || "",/Panitia Survei Field Trip/);
});

test("official-duty coverage status counts persisted assignments, not clicks", () => {
  const need={date:"2026-10-19",period:2,className:"09 AE 1 I",subject:"English"};
  const classes=new Map([["09 ae 1 i","class-id"]]);
  assert.deepEqual(summarizeOfficialDutyCoverage([need],[],classes),{total:1,assigned:0,pending:1});
  const assignment={id:"cov",schedule_date:"2026-10-19",period:2,class_id:"class-id",class_name_snapshot:"09 AE 1 I",substitute_teacher_id:"sub-id",substitute_teacher_name_snapshot:"GURU B",status:"ASSIGNED"};
  assert.deepEqual(summarizeOfficialDutyCoverage([need],[assignment],classes),{total:1,assigned:1,pending:0});
});

test("UI scrolls into the actual editor; badal RPC never creates personal leave", () => {
  const incidental=readFileSync("src/components/IncidentalScheduleAdmin.tsx","utf8");
  const rules=readFileSync("src/components/SubstituteConstraintAdmin.tsx","utf8");
  const sql=readFileSync("supabase/migrations/202610170001_v3_15_official_duty_badal.sql","utf8");
  assert.match(incidental,/editorRef\.current\?\.scrollIntoView/);
  assert.match(rules,/editorRef\.current\?\.scrollIntoView/);
  assert.match(rules,/Tentukan Badal/);
  assert.match(rules,/Badal Aman/);
  assert.match(sql,/OFFICIAL_DUTY/);
  assert.match(sql,/reason_snapshot=v_rule\.reason/);
  assert.doesNotMatch(sql,/insert into public\.leave_requests\b/i);
});


test("V3.15.1 Kebutuhan Badal is discoverable but disabled until normal-teaching restriction is enabled", () => {
  const source = readFileSync("src/components/SubstituteConstraintAdmin.tsx", "utf8");
  assert.doesNotMatch(source, /\{blocksNormalTeaching && <label/);
  assert.match(source, /disabled=\{!blocksNormalTeaching\}/);
  assert.match(source, /checked=\{blocksNormalTeaching && requiresBadal\}/);
  assert.match(source, /if \(!e\.target\.checked\) setRequiresBadal\(false\)/);
  assert.match(source, /requiresBadal: blocksNormalTeaching && requiresBadal/);
  assert.match(source, /Aktifkan 'Guru juga tidak bisa mengajar jadwal normal' terlebih dahulu/);
  assert.match(source, /aria-describedby="requires-badal-help"/);
});

test("RC4.1: a team-teaching NO_SUBSTITUTE resolution is complete without inventing a teacher", () => {
  const need = {date:"2026-10-21",period:2,className:"08 AE 2 I",subject:"Al-Qur'an"};
  const classes = new Map([["08 ae 2 i","class-id"]]);
  const acknowledged = {
    id:"team-cov",schedule_date:"2026-10-21",period:2,class_id:"class-id",
    class_name_snapshot:"08 AE 2 I",substitute_teacher_id:null,
    substitute_teacher_name_snapshot:null,status:"NO_SUBSTITUTE",
  };
  assert.deepEqual(summarizeOfficialDutyCoverage([need],[acknowledged],classes),{total:1,assigned:1,pending:0});
  assert.deepEqual(summarizeOfficialDutyCoverage([need],[{...acknowledged,status:"WAITING"}],classes),{total:1,assigned:0,pending:1});
});
