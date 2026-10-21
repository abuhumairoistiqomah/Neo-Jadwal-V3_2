/** RC5: authoritative V3.18 JP/day counts + non-attendance explanatory RC4 diary.
 * These layers must not be summed or silently coerced to match each other.
 */
import type {RecordedDutyDay,TeacherDutyLogInput} from './teacherDutyLogV319';
import {addIsoDays,buildTeacherDutyLog} from './teacherDutyLogV319';

export interface CanonicalTeacherActivity {
  teacherId:string;
  effectiveTeachingJp:number;
  leaveJp:number;
  effectiveTeachingDays:number;
  leaveDays:number;
}
export interface OperationalTeacherActivity {
  canonical:CanonicalTeacherActivity;
  teachingPct:number|null;
  leavePct:number|null;
  operationalDays:RecordedDutyDay[];
  daysWithPlannedTeaching:number;
  daysWithApprovedLeave:number;
  daysWithBoth:number;
  eventDutyDays:number;
  compensatoryDays:number;
  reviewDays:number;
  planningJp:number;
  recordedTeachingLeaveJp:number;
  dateOverlap:string[];
}
const validCount=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** Security: reject absent, duplicate, and malformed rows instead of interpreting them as zero. */
export function parseCanonicalTeacherActivity(payload:unknown,teacherId:string):CanonicalTeacherActivity {
  if(!Array.isArray(payload))throw new Error('Metrik JP V3.18 tidak tersedia atau formatnya tidak valid.');
  const matches=payload.filter(row=>row&&typeof row==='object'&&row.teacher_id===teacherId);
  if(matches.length!==1)throw new Error('Metrik guru tidak ditemukan atau duplikat pada RPC V3.18.');
  const row=matches[0] as Record<string,unknown>;
  for(const field of ['effective_teaching_jp','leave_jp','effective_teaching_days','leave_days']){
    if(!validCount(row[field]))throw new Error(`Metrik V3.18 ${field} tidak valid.`);
  }
  return {teacherId,effectiveTeachingJp:row.effective_teaching_jp as number,leaveJp:row.leave_jp as number,
    effectiveTeachingDays:row.effective_teaching_days as number,leaveDays:row.leave_days as number};
}
/** RC4 validates at most 31 days per run. Chunk without dropping boundary dates. */
export function buildDutyHistoryByChunks(input:TeacherDutyLogInput):RecordedDutyDay[] {
  if(input.dateEnd<input.dateStart)throw new Error('Rentang tanggal terbalik.');
  const result:RecordedDutyDay[]=[];
  for(let from=input.dateStart;from<=input.dateEnd;){
    const until=addIsoDays(from,30)<input.dateEnd?addIsoDays(from,30):input.dateEnd;
    const profile={...input.profile,dateStart:from,dateEnd:until,
      units:input.profile.units.filter(unit=>unit.date>=from&&unit.date<=until)};
    result.push(...buildTeacherDutyLog({...input,profile,dateStart:from,dateEnd:until}));
    from=addIsoDays(until,1);
    if(result.length>731)throw new Error('Batas rincian operasional 731 hari terlampaui.');
  }
  return result;
}
export function summarizeOperationalTeacherActivity(canonical:CanonicalTeacherActivity,days:ReadonlyArray<RecordedDutyDay>):OperationalTeacherActivity {
  const total=canonical.effectiveTeachingJp+canonical.leaveJp;
  const hasLeave=(d:RecordedDutyDay)=>d.approvedTeachingLeavePeriods.length+d.freeLeavePeriods.length>0;
  return {
    canonical,teachingPct:total?canonical.effectiveTeachingJp/total*100:null,
    leavePct:total?canonical.leaveJp/total*100:null,operationalDays:[...days],
    daysWithPlannedTeaching:days.filter(d=>d.plannedTeachingPeriods.length>0).length,
    daysWithApprovedLeave:days.filter(hasLeave).length,
    daysWithBoth:days.filter(d=>d.plannedTeachingPeriods.length>0&&hasLeave(d)).length,
    eventDutyDays:days.filter(d=>d.status==='EVENT_DUTY'||d.officialDuty.some(x=>!x.includes('Tetap bertugas'))).length,
    compensatoryDays:days.filter(d=>d.status==='COMPENSATORY_OFF'||d.warnings.some(w=>w.includes('Libur pengganti bertabrakan'))).length,
    reviewDays:days.filter(d=>d.warnings.length>0).length,
    planningJp:days.reduce((s,d)=>s+d.plannedTeachingPeriods.length,0),
    recordedTeachingLeaveJp:days.reduce((s,d)=>s+d.approvedTeachingLeavePeriods.length,0),
    dateOverlap:days.filter(d=>d.plannedTeachingPeriods.length>0&&hasLeave(d)).map(d=>d.date),
  };
}
