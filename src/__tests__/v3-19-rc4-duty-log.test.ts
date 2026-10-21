import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTeacherDutyLog,dutyLogSummary,validateDutyLogRange} from '../domain/teacherDutyLogV319';
import type {Teacher,ScheduleItem,KalenderAkademikItem,LogIzinItem} from '../domain/models';
import type {IndividualLeaveProfile} from '../domain/teacherIndividualStatistics';
import type {TeacherDutySnapshot} from '../domain/dutyResolutionV319';
import type {OperationalTerm} from '../infrastructure/repositories/operationalCalendarV319Repository';

const teacher:Teacher={id:'A',nama:'GURU A',mapel_utama:'Math',rumpun:'',jenjang:'',tugas_tambahan:'',keterangan:''};
const basic=(date:string,period:number,id:string):ScheduleItem=>({id,kelas:`09 AE ${period} I`,hari: date==='2026-09-21'?'Senin':date==='2026-09-22'?'Selasa':'Rabu',jam_ke:period,mulai:'08:00',selesai:'09:00',mapel:'Math',guru1:'GURU A',guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',kelasgabung:'Tidak'});
const profile=(start:string,end:string,units:IndividualLeaveProfile['units']=[]):IndividualLeaveProfile=>({teacherId:'A',teacherName:'GURU A',dateStart:start,dateEnd:end,units});
const terms:OperationalTerm[]=[{id:'t',term_code:'2026-S1',title:'Semester 1',kbm_start:'2026-07-20',kbm_end:'2026-12-01',weekdays:[1,2,3,4,5],is_active:true}];
const event={id:'field',title:'Field Trip Ikhwan',date_start:'2026-09-21',date_end:'2026-09-21',scope:'IKHWAN' as const,notes:'',status:'ACTIVE' as const,created_at:'',updated_at:''};
const duty:TeacherDutySnapshot={events:[event],assignments:[{id:'a',event_id:'field',teacher_id:'A',duty_role:'PARTICIPANT',compensation_date:'2026-09-22'}]};
const blank:TeacherDutySnapshot={events:[],assignments:[]};
const input=(start='2026-09-22',end=start)=>({teacher,dateStart:start,dateEnd:end,schedules:[] as ScheduleItem[],incidentals:[],calendar:[] as KalenderAkademikItem[],logs:[] as LogIzinItem[],profile:profile(start,end),duties:blank,terms});

test('RC4 daily log: partial teacher is recorded in BOTH planned teaching days and approved leave days; preserve JP precision',()=>{
 const src=input();src.schedules=[basic('2026-09-22',1,'x'),basic('2026-09-22',2,'y')];
 src.profile=profile(src.dateStart,src.dateEnd,[{date:src.dateStart,period:2,periodType:'TEACHING',reason:'Keluarga',source:'APPROVED',requestType:'PARTIAL'}]);
 const day=buildTeacherDutyLog(src)[0];
 assert.equal(day.status,'TEACHING_AND_LEAVE');
 assert.deepEqual(day.plannedTeachingPeriods,[1]);
 assert.deepEqual(day.approvedTeachingLeavePeriods,[2]);
 const s=dutyLogSummary([day]);assert.equal(s.daysWithPlannedTeaching,1);assert.equal(s.daysWithApprovedLeave,1);
});
test('RC4: approved FREE and JP0 stay distinct from teaching JP, never invent physical attendance',()=>{
 const src=input();src.profile=profile(src.dateStart,src.dateEnd,[
  {date:src.dateStart,period:0,periodType:'FREE',reason:'Izin',source:'APPROVED'},
  {date:src.dateStart,period:4,periodType:'FREE',reason:'Izin',source:'APPROVED'},
 ]);
 const row=buildTeacherDutyLog(src)[0];assert.equal(row.status,'LEAVE_RECORDED');assert.deepEqual(row.freeLeavePeriods,[0,4]);assert.deepEqual(row.plannedTeachingPeriods,[]);
});
test('RC4: compensatory leave blocks teaching plans across any class group and warns of possible badal impact',()=>{
 const src=input();src.schedules=[basic(src.dateStart,2,'b')];src.duties=duty;
 const row=buildTeacherDutyLog(src)[0];assert.equal(row.status,'COMPENSATORY_OFF');assert.deepEqual(row.plannedTeachingPeriods,[]);assert.deepEqual(row.scheduledTeachingPeriods,[2]);assert.match(row.warnings[0],/badal/);
});
test('RC4: explicit REMAINS_ON_DUTY is preserved without automatically giving a day off',()=>{
 const src=input('2026-09-21');src.duties={events:[event],assignments:[{id:'a',event_id:'field',teacher_id:'A',duty_role:'REMAINS_ON_DUTY',compensation_date:null}]};
 const row=buildTeacherDutyLog(src)[0];assert.equal(row.status,'REMAINS_ON_DUTY');assert.deepEqual(row.officialDuty,['Field Trip Ikhwan (Tetap bertugas)']);
});
test('RC4: cancelled events do not create duties, and outside-term dates are not falsely counted as scheduled KBM',()=>{
 const src=input('2026-12-22');src.duties={events:[{...event,status:'CANCELLED'}],assignments:duty.assignments};
 const row=buildTeacherDutyLog(src)[0];assert.equal(row.status,'OUTSIDE_TERM');assert.deepEqual(row.officialDuty,[]);
});
test('RC4: cancelled KBM through the academic calendar suppresses recorded teaching plans',()=>{
 const src=input();src.schedules=[basic(src.dateStart,2,'a')];src.calendar=[{id:'cal',tanggal_mulai:src.dateStart,tanggal_selesai:src.dateEnd,nama_kegiatan:'Rumah Tahfidz',tipe:'Kegiatan',cakupan:'Semua',status:'Aktif'}];
 const row=buildTeacherDutyLog(src)[0];assert.equal(row.status,'NON_KBM');assert.deepEqual(row.plannedTeachingPeriods,[]);
});
test('RC4: fail closed on mismatched teacher profile, wrong date, invalid month or overly long window',()=>{
 const src=input();src.profile={...src.profile,teacherId:'OTHER'};
 assert.throws(()=>buildTeacherDutyLog(src),/Identitas/);
 assert.match(validateDutyLogRange('2026-02-30','2026-03-01')||'',/tidak valid/);
 assert.match(validateDutyLogRange('2026-01-01','2026-02-01')||'',/31 hari/);
});
test('RC4: duty log UI is secured by Supabase role check and read-only with no attendance claims',()=>{
 const ui=readFileSync('src/components/TeacherDutyLogV319Panel.tsx','utf8');
 const cal=readFileSync('src/components/OperationalCalendarV319Admin.tsx','utf8');
 const app=readFileSync('src/App.tsx','utf8');
 assert.match(ui,/getCurrentUserContext/);assert.match(ui,/ADMIN.*WAKASEK/);assert.match(ui,/new TeacherIndividualStatisticsRepository\(\)\.load/);
 assert.match(ui,/Bukan presensi/);assert.match(cal,/TeacherDutyLogV319Panel/);assert.match(app,/incidentals=\{jadwalInsidental\}/);
 assert.doesNotMatch(ui,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});


test("RC4.2: general no-substitute picker and authoritative atomic mixed-write RPC", () => {
  const picker=readFileSync("src/components/InputGuruPengganti.tsx","utf8");
  const bundle=readFileSync("src/domain/inval/invalWrite.ts","utf8");
  const repo=readFileSync("src/infrastructure/repositories/supabaseInvalWriteRepository.ts","utf8");
  const sql=readFileSync("supabase/migrations/202610210002_v3_19_rc4_2_general_team_teaching.sql","utf8");
  assert.match(picker,/allowTeamTeachingNoBadal=\{row\.jam_ke > 0\}/);
  assert.match(bundle,/coverage_decision: "NO_SUBSTITUTE"/);
  assert.match(bundle,/substitute_teacher_id: noAdditionalSubstitute \? null/);
  assert.match(repo,/ejadwal_save_inval_bundle_v319_rc42/);
  assert.match(sql,/TEAM_TEACHING_NOT_AVAILABLE/);
  assert.match(sql,/public\.ejadwal_save_inval_bundle_v3\(/);
  assert.match(sql,/ADMIN_OR_WAKASEK_REQUIRED/);
  assert.match(sql,/ACK_INVAL_TEAM_TEACHING/);
  assert.doesNotMatch(sql,/insert into public\.leave_requests\s*\(/i);
});

test("RC4.2: subject fallback reads exact dated subject, never substitute specialty", () => {
  const mapper=readFileSync("src/infrastructure/repositories/supabaseScheduleMappers.ts","utf8");
  const wa=readFileSync("src/components/LogGuruPengganti.tsx","utf8");
  assert.match(mapper,/row\.subject_snapshot/);
  assert.match(mapper,/inc\.override_subject/);
  assert.match(mapper,/master\.subject/);
  assert.match(mapper,/resolveSubject\(row\)/);
  assert.match(wa,/Mapel belum tercatat — periksa jadwal/);
  assert.match(wa,/session\.coverage_status === "NO_SUBSTITUTE"/);
});


test("RC4.2: official-duty SQL preserves master subject when no incidental row exists", () => {
  const sql=readFileSync("supabase/migrations/202610210002_v3_19_rc4_2_general_team_teaching.sql","utf8");
  const assignment=sql.slice(sql.indexOf("create or replace function public.ejadwal_assign_official_duty_badal_v1"));
  const team=sql.slice(sql.indexOf("create or replace function public.ejadwal_acknowledge_official_duty_team_teaching_v319"));
  assert.match(assignment,/into v_incidental_id,v_incidental_subject/);
  assert.match(team,/into v_incidental_id,v_incidental_subject/);
  assert.match(assignment,/subject_snapshot=coalesce\(nullif\(trim\(v_subject\),''\),subject_snapshot\)/);
  assert.doesNotMatch(assignment,/into v_incidental_id,v_subject/);
  assert.doesNotMatch(team,/into v_incidental_id,v_subject/);
});
