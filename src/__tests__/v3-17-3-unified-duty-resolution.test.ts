import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectPriorityDuties, resolveDisplacedTeacher, dutyOverlaps} from '../domain/schedule/dutyResolution';
import {buildInvalRecommendationDayIndex} from '../domain/inval/recommendationPerformance';
import type {EffectiveScheduleItem} from '../domain/schedule/effectiveSchedule';
import type {Teacher, LogIzinItem} from '../domain/models';

const date = '2026-10-20';
const teacher = (nama:string, id:string):Teacher => ({id,nama,mapel_utama:'Arabic',rumpun:'Arabic',jenjang:'SD',tugas_tambahan:'',keterangan:''});
function schedule(overrides:Record<string,any> = {}):EffectiveScheduleItem {
  return {
    id:'s1',tanggal:date,kelas:'04 INTER 2 I',hari:'Selasa',jam_ke:2,mulai:'08:40',selesai:'09:40',
    mapel:'Fiqh',guru1:'SALMAN',guru2:'MARUF',guru3:'',guru4:'',guru5:'',guru6:'',
    selainguru1_mengawas:'Ya',kelasgabung:'Tidak',source:'MASTER',
    scheduledTeachers:['SALMAN','MARUF'],absentTeachers:[],substituteTeachers:[],effectiveTeachers:['SALMAN','MARUF'],substitutions:[],logIds:[],
    academicEvent:null,isSuppressedByAcademicCalendar:false,isActive:true,...overrides,
  };
}
const log=(teacherName:string, period:number, clazz:string, subject:string):LogIzinItem => ({
  id:`log-${teacherName}`,tanggal:date,guru_izin:'ANOTHER',alasan:'Sakit',jam_ke:period,
  kelas:clazz,mapel:subject,guru_pengganti:teacherName,
});
test('MARUF: badal transfers only assistant and informs SALMAN',()=>{
  const original=schedule();
  const duties=collectPriorityDuties({date,effective:[original],logs:[log('MARUF',2,'08 MQ IKHWAN','Al-Quran')]});
  assert.equal(resolveDisplacedTeacher({original,teacherName:'MARUF',priorityDuties:duties})?.kind,'TRANSFERRED_ASSISTANT');
  assert.equal(resolveDisplacedTeacher({original,teacherName:'SALMAN',priorityDuties:duties}),null);
  assert.equal(duties[0].className,'08 MQ IKHWAN');
});
test('ABDURRAZAQ: explicit incidental overrides assisting Arabic at other class',()=>{
  const original=schedule({mapel:'Arabic',guru1:'YUSRIL',guru2:'ABDURRAZAQ',scheduledTeachers:['YUSRIL','ABDURRAZAQ']});
  const incidental=schedule({id:'to-tka',kelas:'12 AE 1 I',mapel:'TO - Mata Pelajaran Pilihan 2',source:'INCIDENTAL_OVERRIDE',
    teacherTeamReplaced:true,guru1:'ABDURRAZAQ',guru2:'',scheduledTeachers:['ABDURRAZAQ'],incidentalReason:'Mengawas TO TKA'});
  const duties=collectPriorityDuties({date,effective:[original,incidental],logs:[]});
  assert.equal(resolveDisplacedTeacher({original,teacherName:'ABDURRAZAQ',teacher:teacher('ABDURRAZAQ','a'),priorityDuties:duties})?.kind,'TRANSFERRED_ASSISTANT');
  assert.equal(resolveDisplacedTeacher({original,teacherName:'YUSRIL',priorityDuties:duties}),null);
  assert.equal(resolveDisplacedTeacher({original:incidental,teacherName:'ABDURRAZAQ',priorityDuties:duties}),null);
});
test('Room-only incidental does not claim a teacher transfer',()=>{
  const original=schedule();
  const roomChange=schedule({id:'room',source:'INCIDENTAL_OVERRIDE',teacherTeamReplaced:false,kelas:'12 AE 1 I'});
  assert.equal(collectPriorityDuties({date,effective:[original,roomChange],logs:[]}).length,0);
});
test('Main teacher reassignment is a visible conflict, not silent cancel',()=>{
  const original=schedule();
  const duties=collectPriorityDuties({date,effective:[original],logs:[log('SALMAN',2,'08 MQ IKHWAN','Al-Quran')]});
  assert.equal(resolveDisplacedTeacher({original,teacherName:'SALMAN',priorityDuties:duties})?.kind,'PRIMARY_CONFLICT');
});
test('Unrelated JP and non-overlapping time override do not cancel assistant',()=>{
  const original=schedule();
  const away=collectPriorityDuties({date,effective:[original],logs:[log('MARUF',4,'08 MQ IKHWAN','Al-Quran')]});
  assert.equal(resolveDisplacedTeacher({original,teacherName:'MARUF',priorityDuties:away}),null);
  assert.equal(dutyOverlaps({period:2,start:'08:40',end:'09:40'}, {period:2,start:'09:40',end:'10:40'}),false);
  assert.equal(dutyOverlaps({period:2,start:'08:40',end:'09:40'}, {period:3,start:'09:20',end:'10:00'}),true);
});
test('HAMDAN: APPROVED FREE period still marks candidate absent at JP4',()=>{
  const name='HAMDAN';const id='hamdan-id';
  const idx=buildInvalRecommendationDayIndex({teachers:[teacher(name,id)],effectiveSchedulesForDate:[],logs:[],date,
    approvedLeavePeriods:[{teacherId:id,date,period:4}]});
  assert.equal(idx.absentJamKeByTeacher.get(name.toLowerCase())?.has(4),true);
  assert.equal(idx.absentJamKeByTeacher.get(name.toLowerCase())?.has(5),false);
});
test('Multiple different high-priority assignments never silently choose one',()=>{
  const original=schedule();
  const duties=collectPriorityDuties({date,effective:[original],logs:[
    log('MARUF',2,'08 MQ IKHWAN','Al-Quran'), log('MARUF',2,'09 AE 2 I','Math')]});
  assert.equal(resolveDisplacedTeacher({original,teacherName:'MARUF',priorityDuties:duties})?.kind,'MULTIPLE_HIGH_PRIORITY');
});
