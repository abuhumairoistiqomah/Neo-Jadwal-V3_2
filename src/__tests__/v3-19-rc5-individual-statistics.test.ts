import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDutyHistoryByChunks,parseCanonicalTeacherActivity,summarizeOperationalTeacherActivity} from '../domain/teacherOperationalStatisticsV319';
import type {RecordedDutyDay,TeacherDutyLogInput} from '../domain/teacherDutyLogV319';
import type {Teacher} from '../domain/models';

const canonical={teacherId:'T',effectiveTeachingJp:3,leaveJp:5,effectiveTeachingDays:1,leaveDays:1};
const row=(date:string,teaching:number[],absent:number[],override:Partial<RecordedDutyDay>={}):RecordedDutyDay=>({
 date,status:'TEACHING_AND_LEAVE',details:[],scheduledTeachingPeriods:teaching,
 approvedTeachingLeavePeriods:absent,freeLeavePeriods:[],plannedTeachingPeriods:teaching,officialDuty:[],warnings:[],
 termStatus:'WITHIN_TERM',...override,
});

test('RC5: two layers recognize partial days in BOTH sets without JP rounding or double counting',()=>{
 const report=summarizeOperationalTeacherActivity(canonical,[row('2026-10-20',[1,2,3],[4,5,6])]);
 assert.equal(report.canonical.effectiveTeachingDays,1);
 assert.equal(report.canonical.leaveDays,1);
 assert.equal(report.daysWithBoth,1);
 assert.equal(report.planningJp,3);
 assert.equal(report.recordedTeachingLeaveJp,3);
 assert.equal(report.teachingPct,37.5);
 assert.equal(report.leavePct,62.5);
 assert.deepEqual(report.dateOverlap,['2026-10-20']);
});
test('RC5: honors canonical RPC metrics without substituting an incompatible RC4 count',()=>{
 const activity=summarizeOperationalTeacherActivity(canonical,[row('2026-10-20',[1],[2,3])]);
 assert.equal(activity.canonical.effectiveTeachingJp,3);
 assert.equal(activity.planningJp,1);
 assert.equal(activity.canonical.leaveJp,5);
 assert.equal(activity.recordedTeachingLeaveJp,2);
});
test('RC5: no recorded JP denominator yields no invented percentage',()=>{
 const report=summarizeOperationalTeacherActivity({...canonical,effectiveTeachingJp:0,leaveJp:0},[]);
 assert.equal(report.teachingPct,null);assert.equal(report.leavePct,null);
});
test('RC5: FREE and JP0 are leave dates but not teaching leave JP; official duty and compensation separate',()=>{
 const days=[row('2026-10-20',[],[],{freeLeavePeriods:[0,5],status:'LEAVE_RECORDED'}),
 row('2026-10-21',[],[],{status:'COMPENSATORY_OFF'}),
 row('2026-10-22',[],[],{status:'EVENT_DUTY',officialDuty:['Field Trip (Staf/panitia)']})];
 const report=summarizeOperationalTeacherActivity(canonical,days);
 assert.equal(report.daysWithApprovedLeave,1);assert.equal(report.recordedTeachingLeaveJp,0);
 assert.equal(report.eventDutyDays,1);assert.equal(report.compensatoryDays,1);
});
test('RC5: parse canonical RPC strictly; missing teacher, duplicate IDs, null and fractions fail closed',()=>{
 const ok={teacher_id:'T',effective_teaching_jp:2,leave_jp:3,effective_teaching_days:1,leave_days:1};
 assert.equal(parseCanonicalTeacherActivity([ok],'T').leaveJp,3);
 assert.throws(()=>parseCanonicalTeacherActivity([],'T'),/tidak ditemukan/);
 assert.throws(()=>parseCanonicalTeacherActivity([ok,ok],'T'),/duplikat/);
 assert.throws(()=>parseCanonicalTeacherActivity([{...ok,leave_jp:null}],'T'),/tidak valid/);
 assert.throws(()=>parseCanonicalTeacherActivity([{...ok,leave_jp:1.5}],'T'),/tidak valid/);
});
test('RC5: chunk ranges cover boundaries once, even when individual diary is limited to 31 days',()=>{
 const teacher:Teacher={id:'T',nama:'GURU T',mapel_utama:'Math',rumpun:'',jenjang:'',tugas_tambahan:'',keterangan:''};
 const input:TeacherDutyLogInput={teacher,dateStart:'2026-10-01',dateEnd:'2026-12-01',
 schedules:[],incidentals:[],calendar:[],logs:[],profile:{teacherId:'T',teacherName:'GURU T',dateStart:'2026-10-01',dateEnd:'2026-12-01',units:[]},
 duties:{events:[],assignments:[]},terms:[]};
 const days=buildDutyHistoryByChunks(input);
 assert.equal(days.length,62);assert.equal(new Set(days.map(d=>d.date)).size,62);
 assert.equal(days[0].date,'2026-10-01');assert.equal(days[30].date,'2026-10-31');
 assert.equal(days[31].date,'2026-11-01');assert.equal(days.at(-1)?.date,'2026-12-01');
});
test('RC5: individual report uses existing staff-only RPC and read-only operational drilldown, no new SQL',()=>{
 const individual=readFileSync('src/components/TeacherIndividualStatistics.tsx','utf8');
 const component=readFileSync('src/components/TeacherV319OperationalSummary.tsx','utf8');
 const repo=readFileSync('src/infrastructure/repositories/teacherOperationalStatisticsV319Repository.ts','utf8');
 assert.match(individual,/TeacherV319OperationalSummary/);
 assert.match(repo,/ejadwal_teacher_effective_activity_v318/);
 assert.match(component,/Hari Mengajar Efektif/);assert.match(component,/Hari Izin/);
 assert.match(component,/Bukan presensi|bukan bukti kehadiran/i);
 assert.doesNotMatch(component,/\.insert\(|\.update\(|\.delete\(/);
});
