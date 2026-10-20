/** V3.19 RC3: date-specific duty availability derived only from explicit RC2 staff assignments.
 * Does not assert physical attendance, mutate leave, or override an academic closure.
 */
import type { Teacher, ScheduleItem, JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem } from './models';
import {buildEffectiveScheduleForDate} from './schedule/effectiveSchedule';
import type {StoredDutyEvent,StoredDutyAssignment} from '../infrastructure/repositories/teacherDutyV319Repository';

export interface TeacherDutySnapshot {
  events:ReadonlyArray<StoredDutyEvent>;
  assignments:ReadonlyArray<StoredDutyAssignment>;
}
export interface DutyBlock {teacherId:string;date:string;kind:'EVENT_DUTY'|'COMPENSATORY_OFF';reason:string;eventId:string;eventTitle:string;}
export interface DutyTeachingImpact {
  key:string;date:string;period:number;className:string;subject:string;
  teacherId:string;teacherName:string;reason:string;eventId:string;
  /** True if a persisted dated log already names a substitute for the class/JP/teacher. */
  covered:boolean;
}

const normalizeName=(value:string)=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
export function resolveTeacherDutyBlock(snapshot:TeacherDutySnapshot,teacherId:string,date:string):DutyBlock|null {
  if(!teacherId || !/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const active=new Map(snapshot.events.filter(e=>e.status==='ACTIVE').map(e=>[e.id,e]));
  const matching=snapshot.assignments.filter(a=>a.teacher_id===teacherId && active.has(a.event_id));
  // A compensatory day granted by an active event blocks all classes, regardless of group.
  const compensation=matching.find(a=>a.compensation_date===date && a.duty_role!=='REMAINS_ON_DUTY');
  if(compensation){const e=active.get(compensation.event_id)!;return {teacherId,date,kind:'COMPENSATORY_OFF',reason:`Libur pengganti: ${e.title}`,eventId:e.id,eventTitle:e.title};}
  const assignment=matching.find(a=>a.duty_role!=='REMAINS_ON_DUTY' && date>=active.get(a.event_id)!.date_start && date<=active.get(a.event_id)!.date_end);
  if(assignment){const e=active.get(assignment.event_id)!;return {teacherId,date,kind:'EVENT_DUTY',reason:`Ditugaskan pada kegiatan: ${e.title}`,eventId:e.id,eventTitle:e.title};}
  return null;
}
export function findDutyTeachingImpacts(input:{
  snapshot:TeacherDutySnapshot; date:string; teachers:ReadonlyArray<Teacher>;
  schedules:ScheduleItem[];incidentals?:JadwalInsidentalItem[];
  calendar?:KalenderAkademikItem[];logs?:LogIzinItem[];
}):DutyTeachingImpact[] {
  const {snapshot,date,teachers,schedules,incidentals=[],calendar=[],logs=[]}=input;
  const teacherByName=new Map(teachers.filter(t=>t.id).map(t=>[normalizeName(t.nama),t]));
  const result:DutyTeachingImpact[]=[];
  const seen=new Set<string>();
  const effective=buildEffectiveScheduleForDate({date,schedules,jadwalInsidental:incidentals,logs,kalenderAkademik:calendar});
  for(const row of effective){
    if(!row.isActive)continue;
    for(const name of row.scheduledTeachers){
      const teacher=teacherByName.get(normalizeName(name));
      if(!teacher?.id)continue; // never infer duty through a gender or subject association
      const block=resolveTeacherDutyBlock(snapshot,teacher.id,date);
      if(!block)continue;
      const key=`${date}|${row.jam_ke}|${normalizeName(row.kelas)}|${teacher.id}`;
      if(seen.has(key))continue;
      seen.add(key);
      const covered=logs.some(l=>l.tanggal===date && Number(l.jam_ke)===Number(row.jam_ke) && normalizeName(l.kelas)===normalizeName(row.kelas) && normalizeName(l.guru_izin)===normalizeName(name) && Boolean(String(l.guru_pengganti||'').trim()));
      result.push({key,date,period:Number(row.jam_ke),className:row.kelas,subject:row.mapel,teacherId:teacher.id,teacherName:teacher.nama,reason:block.reason,eventId:block.eventId,covered});
    }
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.period-b.period||a.className.localeCompare(b.className)||a.teacherName.localeCompare(b.teacherName));
}

/** Previously recorded substitute could become unavailable after an RC2 event edit.
 * These are warnings only; historical coverage rows remain intact for human review.
 */
export function findDutySubstituteConflicts(input:{snapshot:TeacherDutySnapshot;date:string;teachers:ReadonlyArray<Teacher>;logs:ReadonlyArray<LogIzinItem>}):DutyTeachingImpact[] {
 const {snapshot,date,teachers,logs}=input;
 const byName=new Map(teachers.filter(t=>t.id).map(t=>[normalizeName(t.nama),t]));
 const byId=new Map(teachers.filter(t=>t.id).map(t=>[t.id!,t]));
 const seen=new Set<string>();
 const items:DutyTeachingImpact[]=[];
 for(const log of logs){
  if(log.tanggal!==date || !String(log.guru_pengganti||'').trim())continue;
  const teacher=(log.substitute_teacher_id && byId.get(log.substitute_teacher_id)) || byName.get(normalizeName(log.guru_pengganti));
  if(!teacher?.id)continue;
  const block=resolveTeacherDutyBlock(snapshot,teacher.id,date);
  if(!block)continue;
  const key=`substitute|${date}|${log.jam_ke}|${normalizeName(log.kelas)}|${teacher.id}`;
  if(seen.has(key))continue;
  seen.add(key);
  items.push({key,date,period:Number(log.jam_ke),className:log.kelas,subject:log.mapel,
   teacherId:teacher.id,teacherName:teacher.nama,reason:block.reason,eventId:block.eventId,covered:false});
 }
 return items.sort((a,b)=>a.period-b.period||a.className.localeCompare(b.className));
}
