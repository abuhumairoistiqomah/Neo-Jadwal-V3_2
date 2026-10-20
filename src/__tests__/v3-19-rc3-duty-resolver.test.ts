import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveTeacherDutyBlock,findDutyTeachingImpacts,findDutySubstituteConflicts,type TeacherDutySnapshot} from '../domain/dutyResolutionV319';
import type {Teacher,ScheduleItem,KalenderAkademikItem} from '../domain/models';
const events=[
  {id:'trip',title:'Field Trip Ikhwan',date_start:'2026-09-21',date_end:'2026-09-21',scope:'IKHWAN' as const,notes:'',status:'ACTIVE' as const,created_at:'',updated_at:''},
  {id:'cancel',title:'Acara batal',date_start:'2026-09-21',date_end:'2026-09-21',scope:'ALL' as const,notes:'',status:'CANCELLED' as const,created_at:'',updated_at:''},
];
const snapshot:TeacherDutySnapshot={events,assignments:[
 {id:'a',event_id:'trip',teacher_id:'t1',duty_role:'PARTICIPANT',compensation_date:'2026-09-22'},
 {id:'b',event_id:'trip',teacher_id:'t2',duty_role:'REMAINS_ON_DUTY',compensation_date:null},
 {id:'c',event_id:'cancel',teacher_id:'t3',duty_role:'STAFF',compensation_date:'2026-09-23'},
]};
const teachers:Teacher[]=[
 {id:'t1',nama:'GURU A',mapel_utama:'Math',rumpun:'',jenjang:'',tugas_tambahan:'',keterangan:''},
 {id:'t2',nama:'GURU B',mapel_utama:'Math',rumpun:'',jenjang:'',tugas_tambahan:'',keterangan:''},
 {id:'t3',nama:'GURU C',mapel_utama:'Math',rumpun:'',jenjang:'',tugas_tambahan:'',keterangan:''},
];
const schedules:ScheduleItem[]=[
 {id:'s1',kelas:'09 AE 1 I',hari:'Selasa',jam_ke:2,mulai:'08:00',selesai:'09:00',mapel:'Math',guru1:'GURU A',guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',kelasgabung:'Tidak'},
 {id:'s2',kelas:'09 AE 2 A',hari:'Selasa',jam_ke:3,mulai:'09:00',selesai:'10:00',mapel:'Science',guru1:'GURU A',guru2:'GURU B',guru3:'',guru4:'',guru5:'',guru6:'',kelasgabung:'Tidak'},
];
test('RC3: explicit participants are blocked on the activity date; no automatic class/gender participants',()=>{
 const match=resolveTeacherDutyBlock(snapshot,'t1','2026-09-21');
 assert.equal(match?.kind,'EVENT_DUTY');
 assert.equal(resolveTeacherDutyBlock(snapshot,'unknown','2026-09-21'),null);
 assert.equal(resolveTeacherDutyBlock(snapshot,'t2','2026-09-21'),null);
 assert.equal(resolveTeacherDutyBlock(snapshot,'t3','2026-09-21'),null);
});
test('RC3: compensation blocks every teaching group on exactly its specified date',()=>{
 assert.equal(resolveTeacherDutyBlock(snapshot,'t1','2026-09-22')?.kind,'COMPENSATORY_OFF');
 assert.equal(resolveTeacherDutyBlock(snapshot,'t1','2026-09-23'),null);
 assert.equal(resolveTeacherDutyBlock(snapshot,'t2','2026-09-22'),null);
 assert.equal(resolveTeacherDutyBlock(snapshot,'t3','2026-09-23'),null);
});
test('RC3: impact uses effective class slots, retains calendar cancellations, never counts free JP',()=>{
 const result=findDutyTeachingImpacts({snapshot,date:'2026-09-22',teachers,schedules});
 assert.deepEqual(result.map(r=>[r.className,r.period,r.teacherId]),[['09 AE 1 I',2,'t1'],['09 AE 2 A',3,'t1']]);
 assert.equal(result.every(r=>!r.covered),true);
 const calendar:KalenderAkademikItem[]=[{id:'holiday',tanggal_mulai:'2026-09-22',tanggal_selesai:'2026-09-22',nama_kegiatan:'Libur kelas',tipe:'Kegiatan',cakupan:'Semua',jp_mulai:2,jp_selesai:2,status:'Aktif'}];
 const after=findDutyTeachingImpacts({snapshot,date:'2026-09-22',teachers,schedules,calendar});
 assert.deepEqual(after.map(r=>r.period),[3]);
});
test('RC3: stored coverage is marked review-complete, not auto-created',()=>{
 const result=findDutyTeachingImpacts({snapshot,date:'2026-09-22',teachers,schedules,logs:[{
 id:'log',tanggal:'2026-09-22',kelas:'09 AE 1 I',jam_ke:2,mapel:'Math',guru_izin:'GURU A',guru_pengganti:'GURU D',alasan:'Tugas resmi'
 }]});
 assert.equal(result.filter(r=>r.covered).length,1);
 assert.equal(result.filter(r=>!r.covered).length,1);
});
test('RC3: server blocks fresh/stale browser badal, retaining prior approved leave and constraints',()=>{
 const sql=readFileSync('supabase/migrations/202610200003_v3_19_rc3_duty_resolver_guard.sql','utf8');
 assert.match(sql,/ejadwal_validate_substitute_constraints/);
 assert.match(sql,/ejadwal_teacher_duty_assignments_v319/);
 assert.match(sql,/e\.status = 'ACTIVE'/);
 assert.match(sql,/a\.duty_role in \('PARTICIPANT', 'STAFF'\)/);
 assert.match(sql,/a\.compensation_date = p_date/);
 assert.match(sql,/SUBSTITUTE_ON_DUTY_OR_COMPENSATORY_OFF/);
 assert.match(sql,/SUBSTITUTE_ON_APPROVED_LEAVE/);
 assert.match(sql,/SOFT_SUBSTITUTE_CONSTRAINT_ACK_REQUIRED/);
 assert.match(sql,/HARD_SUBSTITUTE_CONSTRAINT/);
 assert.doesNotMatch(sql,/(insert into|update|delete from) public\.(?:leave_requests|coverage_slots|schedule_master)\b/i);
});
test('RC3: recommender and Conflict Center use the same active-date resolver',()=>{
 const input=readFileSync('src/components/InputGuruPengganti.tsx','utf8');
 const panel=readFileSync('src/components/DutyImpactV319Panel.tsx','utf8');
 const schedule=readFileSync('src/components/ScheduleControlCenter.tsx','utf8');
 assert.match(input,/resolveTeacherDutyBlock/);
 assert.match(input,/dutyReady/);
 assert.match(panel,/findDutyTeachingImpacts/);
 assert.match(schedule,/DutyImpactV319Panel/);
 assert.match(input,/HARD_BLOCKED/);
});

test('RC3: after event changes, conflicting already assigned substitutes are explicitly flagged, not deleted',()=>{
 const conflicts=findDutySubstituteConflicts({snapshot,date:'2026-09-22',teachers,logs:[{
  id:'l1',tanggal:'2026-09-22',kelas:'10 AE 1 A',jam_ke:3,mapel:'English',guru_izin:'GURU B',guru_pengganti:'GURU A',substitute_teacher_id:'t1',alasan:'Sakit'
 }]});
 assert.equal(conflicts.length,1);
 assert.match(conflicts[0].reason,/Libur pengganti/);
 assert.equal(findDutySubstituteConflicts({snapshot,date:'2026-09-23',teachers,logs:[]}).length,0);
});
