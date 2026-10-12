import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIndividualTeacherStatistics, type IndividualLeaveProfile} from '../domain/teacherIndividualStatistics';
import type {ScheduleItem} from '../domain/models';
const slot = (id:string,hari:string,jp:number,kelas=id):ScheduleItem => ({
  id,kelas,hari,jam_ke:jp,mapel:'Math',guru1:'GURU TEST',guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',
  kelasgabung:'Tidak',mulai:'07:40',selesai:'08:40',
});
const base:IndividualLeaveProfile = {teacherId:'x',teacherName:'GURU TEST',dateStart:'2026-10-12',dateEnd:'2026-10-23',units:[
  {date:'2026-10-12',period:1,periodType:'TEACHING',reason:'Sakit',source:'APPROVED',requestType:'FULL_DAY'},
  {date:'2026-10-16',period:2,periodType:'TEACHING',reason:'Keluarga',source:'APPROVED',requestType:'PARTIAL'},
  {date:'2026-10-19',period:1,periodType:'TEACHING',reason:'Urusan',source:'LEGACY_IMPORT'},
  {date:'2026-10-12',period:3,periodType:'FREE',reason:'Sakit',source:'APPROVED',requestType:'FULL_DAY'},
  {date:'2026-10-12',period:0,periodType:'TEACHING',reason:'Sakit',source:'APPROVED',requestType:'FULL_DAY'},
]};
const make = (profile=base,academicEvents:any[]=[])=>(buildIndividualTeacherStatistics({
  profile,teacherName:'GURU TEST',hasHomeroomDuty:true,
  schedules:[slot('m','Senin',1,'01 INTER'),slot('m2','Senin',1,'01 MQ'),slot('f','Jumat',2,'02 INTER')],
  academicEvents,
}));
test('teaching JPs, JP0 and FREE stay separate and combined classes deduplicate',()=>{
  const s=make();
  assert.equal(s.recordedTeachingLeaveJp,3);
  assert.equal(s.homeroomLeaveJp,1);
  assert.equal(s.freeLeaveJp,1);
  assert.equal(s.totalLeaveJp,5);
  assert.equal(s.expectedTeachingJp,4);
  assert.equal(s.teachingLeavePct,75);
  assert.equal(s.estimatedRequiredPresenceJp,64);
  assert.equal(s.comparableOperationalLeaveJp,5);
  assert.equal(s.operationalLeavePct,7.8);
});
test('FULL_DAY/PARTIAL/UNKNOWN produce different heatmaps with identical denominators',()=>{
  const s=make();
  assert.deepEqual(s.teachingByScope,{FULL_DAY:1,PARTIAL:1,UNKNOWN:1});
  assert.deepEqual(s.absentDatesByScope,{FULL_DAY:1,PARTIAL:1,UNKNOWN:1});
  const monday = 0, friday = 4;
  assert.equal(s.daysByMode.ALL[monday].byPeriod[0].absent,2);
  assert.equal(s.daysByMode.FULL_DAY[monday].byPeriod[0].absent,1);
  assert.equal(s.daysByMode.PARTIAL[monday].byPeriod[0].absent,0);
  assert.equal(s.daysByMode.UNKNOWN[monday].byPeriod[0].absent,1);
  assert.equal(s.daysByMode.PARTIAL[friday].byPeriod[1].absent,1);
  for (const mode of ['FULL_DAY','PARTIAL','UNKNOWN'] as const)
    assert.equal(s.daysByMode[mode][monday].byPeriod[0].scheduled,2);
});
test('chronological rows reveal which exact teaching JP/date was missed',()=>{
  const s=make();
  const day = s.chronological.find(d=>d.date==='2026-10-12');
  assert.ok(day);
  assert.deepEqual(day.absentPeriods,[{period:1,scope:'FULL_DAY'}]);
  assert.equal(day.jp0Absent,true);
  assert.equal(day.jpFreeAbsent,1);
});
test('unknown legacy mode is never inferred as full day by count or reason',()=>{
  const s=make({...base,units:[{date:'2026-10-19',period:1,periodType:'TEACHING',reason:'Sakit seharian',source:'LEGACY_IMPORT'}]});
  assert.equal(s.teachingByScope.UNKNOWN,1);
  assert.equal(s.teachingByScope.FULL_DAY,0);
  assert.equal(s.teachingByScope.PARTIAL,0);
});
test('full-school holiday removes teaching and nominal required presence denominators',()=>{
  const s=make(base,[{id:'holiday',tanggal_mulai:'2026-10-12',tanggal_selesai:'2026-10-12',
    nama_kegiatan:'Libur sekolah',tipe:'Libur',cakupan:'Semua',status:'Aktif'}]);
  assert.equal(s.expectedTeachingJp,3);
  assert.equal(s.estimatedRequiredPresenceJp,57);
  assert.equal(s.unmatchedHistoricalLeaveJp,1);
});
test('RPC v2 retains staff checks, uses stored request type and restricts anonymous access',()=>{
  const root=process.cwd();
  const sql=readFileSync(`${root}/supabase/migrations/202610120008_v3_14_6_teacher_leave_patterns.sql`,'utf8');
  const repo=readFileSync(`${root}/src/infrastructure/repositories/teacherIndividualStatisticsRepository.ts`,'utf8');
  const ui=readFileSync(`${root}/src/components/LeaveRequestForm.tsx`,'utf8');
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/request_type/);
  assert.match(sql,/revoke all on function public\.ejadwal_teacher_leave_profile_v2\(uuid,date,date\) from public,anon/);
  assert.match(repo,/ejadwal_teacher_leave_profile_v2/);
  assert.match(ui,/https:\/\/wa\.me\/6281325245959/);
  assert.match(ui,/Bukti Izin dari Manajemen/);
});
