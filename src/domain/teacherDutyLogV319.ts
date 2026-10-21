/** V3.19 RC4: explanatory LOG OF RECORDED DUTY, never physical attendance.
 * Two independent dimensions: a unique-date recognition marker and exact JP sets.
 * This is a planning/audit view; RC5 owns aggregate statistical definitions.
 */
import type {Teacher,ScheduleItem,JadwalInsidentalItem,KalenderAkademikItem,LogIzinItem} from './models';
import type {IndividualLeaveProfile} from './teacherIndividualStatistics';
import type {OperationalTerm} from '../infrastructure/repositories/operationalCalendarV319Repository';
import type {TeacherDutySnapshot} from './dutyResolutionV319';
import {resolveTeacherDutyBlock} from './dutyResolutionV319';
import {buildEffectiveScheduleForDate} from './schedule/effectiveSchedule';
import {isIsoDay} from './teacherDutyV319';

export type RecordedDayStatus = 'COMPENSATORY_OFF'|'EVENT_DUTY'|'DUTY_CONFLICT'|'TEACHING_AND_LEAVE'|'TEACHING_PLANNED'|'LEAVE_RECORDED'|'REMAINS_ON_DUTY'|'NON_KBM'|'OUTSIDE_TERM'|'NO_RECORDED_ASSIGNMENT';
export interface RecordedDutyDay {
 date:string; status:RecordedDayStatus; details:string[];
 /** Distinct active scheduled/effective teaching JP potentially assigned to this teacher. */
 scheduledTeachingPeriods:number[];
 /** Distinct JP for which the approved-leave profile records TEACHING leave, including unmatched historical periods. */
 approvedTeachingLeavePeriods:number[];
 /** Leave recorded for FREE periods or JP0; separate from teaching JP. */
 freeLeavePeriods:number[];
 /** Teaching assignments after recorded leave and RC2 duty blocks; NEVER proof that a lesson was delivered. */
 plannedTeachingPeriods:number[];
 /** Explicit non-teaching commitment from RC2. */
 officialDuty:string[];
 warnings:string[];
 termStatus:'WITHIN_TERM'|'OUTSIDE_TERM'|'TERM_NOT_CONFIGURED';
}
export interface TeacherDutyLogInput {
 teacher:Teacher;dateStart:string;dateEnd:string;
 schedules:ReadonlyArray<ScheduleItem>;incidentals:ReadonlyArray<JadwalInsidentalItem>;
 calendar:ReadonlyArray<KalenderAkademikItem>;logs:ReadonlyArray<LogIzinItem>;
 profile:IndividualLeaveProfile;duties:TeacherDutySnapshot;terms:ReadonlyArray<OperationalTerm>;
}
const key=(s:unknown)=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
export const addIsoDays=(s:string,n:number):string=>{
 const [y,m,d]=s.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
};
const sorted=(numbers:Set<number>)=>Array.from(numbers).sort((a,b)=>a-b);
export function validateDutyLogRange(start:string,end:string):string|null {
 if(!isIsoDay(start)||!isIsoDay(end)||end<start)return 'Rentang tanggal tidak valid.';
 if(addIsoDays(start,30)<end)return 'Maksimum 31 hari per pencarian untuk menjaga performa.';
 return null;
}
export function buildTeacherDutyLog(input:TeacherDutyLogInput):RecordedDutyDay[] {
 const {teacher,dateStart,dateEnd,schedules,incidentals,calendar,logs,profile,duties,terms}=input;
 const issue=validateDutyLogRange(dateStart,dateEnd);
 if(issue)throw new Error(issue);
 if(!teacher.id || profile.teacherId!==teacher.id || profile.dateStart!==dateStart || profile.dateEnd!==dateEnd)
   throw new Error('Identitas atau rentang profil izin tidak cocok; log tidak boleh disimpulkan dari data guru lain.');
 const name=key(teacher.nama);
 const activeEvents=new Map(duties.events.filter(e=>e.status==='ACTIVE').map(e=>[e.id,e]));
 const assigned=duties.assignments.filter(a=>a.teacher_id===teacher.id&&activeEvents.has(a.event_id));
 const activeTerms=terms.filter(t=>t.is_active);
 const rows:RecordedDutyDay[]=[];
 for(let date=dateStart;date<=dateEnd;date=addIsoDays(date,1)) {
   const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
   const withinTerms=activeTerms.filter(t=>t.kbm_start<=date&&t.kbm_end>=date&&t.weekdays.includes(weekday));
   const termStatus:RecordedDutyDay['termStatus']=activeTerms.length===0?'TERM_NOT_CONFIGURED':withinTerms.length?'WITHIN_TERM':'OUTSIDE_TERM';
   const effective=buildEffectiveScheduleForDate({date,schedules:[...schedules],jadwalInsidental:incidentals.filter(i=>i.tanggal===date),logs:logs.filter(l=>l.tanggal===date),kalenderAkademik:[...calendar]});
   const teaching=new Set<number>();
   const cancelledForTeacher=new Set<number>();
   const calendarReasons=new Set<string>();
   for(const row of effective){
     const originallyAssigned=row.scheduledTeachers.some(t=>key(t)===name);
     const currentlyAssigned=row.effectiveTeachers.some(t=>key(t)===name);
     if(!originallyAssigned&&!currentlyAssigned)continue;
     const jp=Number(row.jam_ke);
     if(!Number.isInteger(jp)||jp<1||jp>6)continue;
     if(!row.isActive){
       if(row.academicEvent)calendarReasons.add(row.academicEvent.nama_kegiatan);
       cancelledForTeacher.add(jp);continue;
     }
     // Teacher can be initially assigned but removed by a dated substitute; do not re-add them.
     if(currentlyAssigned)teaching.add(jp);
   }
   const approvedTeaching=new Set<number>();
   const freeLeave=new Set<number>();
   const leaveReasons=new Set<string>();
   for(const unit of profile.units){
     if(unit.date!==date)continue;
     if(!Number.isInteger(unit.period)||unit.period<0||unit.period>6)continue;
     if(unit.periodType==='TEACHING'&&unit.period>=1)approvedTeaching.add(unit.period);
     else freeLeave.add(unit.period);
     if(unit.reason.trim())leaveReasons.add(unit.reason.trim());
   }
   const block=resolveTeacherDutyBlock(duties,teacher.id,date);
   const currentDuty=assigned.filter(a=>{
      const e=activeEvents.get(a.event_id)!;
      return e.date_start<=date && e.date_end>=date;
   });
   const explicitDuty=currentDuty.map(a=>{
      const event=activeEvents.get(a.event_id)!;
      return `${event.title} (${a.duty_role==='REMAINS_ON_DUTY'?'Tetap bertugas':a.duty_role==='STAFF'?'Staf/panitia':'Peserta'})`;
   });
   const warnings:string[]=[];
   if(block && teaching.size)warnings.push(`Ada ${teaching.size} JP terjadwal bersamaan dengan ${block.reason}; tinjau kebutuhan badal.`);
   if(block?.kind==='COMPENSATORY_OFF' && approvedTeaching.size)warnings.push('Libur pengganti dan izin APPROVED jatuh pada tanggal yang sama; perlu tinjauan, jangan dihitung sebagai izin tambahan.');
   if(block?.kind==='COMPENSATORY_OFF' && currentDuty.length)warnings.push('Libur pengganti bertabrakan dengan penugasan kegiatan aktif pada tanggal ini.');
   if(block?.kind==='EVENT_DUTY' && approvedTeaching.size)warnings.push('Izin APPROVED dan tugas kegiatan jatuh pada tanggal yang sama; cek keputusan operasional.');
   if(termStatus==='OUTSIDE_TERM' && teaching.size)warnings.push('Ada jadwal terbit di luar periode KBM; cek apakah merupakan kegiatan khusus, bukan otomatis hari sekolah.');
   if(termStatus==='TERM_NOT_CONFIGURED')warnings.push('Semester aktif belum dikonfigurasi; klasifikasi batas periode belum dapat dipastikan.');
   const planned=new Set([...teaching].filter(p=>!approvedTeaching.has(p)&&block===null));
   let status:RecordedDayStatus;
   if(warnings.some(w=>w.includes('bertabrakan')) || (block && approvedTeaching.size))status='DUTY_CONFLICT';
   else if(block?.kind==='COMPENSATORY_OFF')status='COMPENSATORY_OFF';
   else if(block?.kind==='EVENT_DUTY')status='EVENT_DUTY';
   else if(planned.size&&approvedTeaching.size)status='TEACHING_AND_LEAVE';
   else if(planned.size)status='TEACHING_PLANNED';
   else if(approvedTeaching.size||freeLeave.size)status='LEAVE_RECORDED';
   else if(explicitDuty.some(d=>d.includes('Tetap bertugas')))status='REMAINS_ON_DUTY';
   else if(termStatus==='OUTSIDE_TERM')status='OUTSIDE_TERM';
   else if(calendarReasons.size||cancelledForTeacher.size)status='NON_KBM';
   else status='NO_RECORDED_ASSIGNMENT';
   rows.push({date,status,details:[...calendarReasons,...leaveReasons],scheduledTeachingPeriods:sorted(teaching),approvedTeachingLeavePeriods:sorted(approvedTeaching),freeLeavePeriods:sorted(freeLeave),plannedTeachingPeriods:sorted(planned),officialDuty:explicitDuty,warnings,termStatus});
 }
 return rows;
}
export const dutyLogSummary=(days:ReadonlyArray<RecordedDutyDay>)=>({
 daysWithPlannedTeaching:days.filter(d=>d.plannedTeachingPeriods.length>0).length,
 daysWithApprovedLeave:days.filter(d=>d.approvedTeachingLeavePeriods.length+d.freeLeavePeriods.length>0).length,
 daysWithDuty:days.filter(d=>d.officialDuty.some(x=>!/Tetap bertugas/.test(x))).length,
 compensatoryDays:days.filter(d=>d.status==='COMPENSATORY_OFF'||d.officialDuty.length>0&&d.warnings.some(w=>w.includes('Libur pengganti bertabrakan'))).length,
 daysToReview:days.filter(d=>d.warnings.some(w=>/tinjau|tabrakan|bertabrakan/.test(w))).length,
});
