/** V3.20: why a teacher is unavailable is distinct from how many JPs are affected.
 * UNCLASSIFIED is for imported/previously recorded data only, never an option on a new form.
 */
export type LeaveAbsenceCategory = 'PERSONAL' | 'SCHOOL_DUTY' | 'UNCLASSIFIED';
export type NewLeaveAbsenceCategory = Exclude<LeaveAbsenceCategory, 'UNCLASSIFIED'>;
export const ABSENCE_CATEGORY_OPTIONS: ReadonlyArray<{value:NewLeaveAbsenceCategory;label:string;description:string}> = [
  {value:'PERSONAL',label:'Urusan Pribadi',description:'Sakit, keperluan keluarga, atau keperluan pribadi'},
  {value:'SCHOOL_DUTY',label:'Tugas Sekolah',description:'Visitasi, panitia, pendampingan, atau penugasan resmi'},
];
export const normalizeAbsenceCategory = (value:unknown): LeaveAbsenceCategory =>
  value === 'PERSONAL' || value === 'SCHOOL_DUTY' ? value : 'UNCLASSIFIED';
export const absenceCategoryLabel = (value:LeaveAbsenceCategory):string =>
  value === 'PERSONAL' ? 'Urusan Pribadi' : value === 'SCHOOL_DUTY' ? 'Tugas Sekolah' : 'Belum Dikategorikan';

export interface LeaveCategoryUnit {date:string; period:number; periodType:'TEACHING'|'FREE'; category:LeaveAbsenceCategory}
/** Unique (date,JP); classification is not a physical attendance assertion. */
export function summarizeAbsenceCategories(units:ReadonlyArray<LeaveCategoryUnit>) {
  const priority: Record<LeaveAbsenceCategory,number> = {PERSONAL:3,SCHOOL_DUTY:2,UNCLASSIFIED:1};
  const unique = new Map<string,LeaveCategoryUnit>();
  for(const unit of units) {
    const key = `${unit.date}|${unit.period}`;
    const existing = unique.get(key);
    if(!existing || priority[unit.category] > priority[existing.category]) unique.set(key,unit);
  }
  const result:Record<LeaveAbsenceCategory,{days:number;teachingJp:number;otherJp:number;totalJp:number}> = {
    PERSONAL:{days:0,teachingJp:0,otherJp:0,totalJp:0},
    SCHOOL_DUTY:{days:0,teachingJp:0,otherJp:0,totalJp:0},
    UNCLASSIFIED:{days:0,teachingJp:0,otherJp:0,totalJp:0},
  };
  const days:Record<LeaveAbsenceCategory,Set<string>> = {PERSONAL:new Set(),SCHOOL_DUTY:new Set(),UNCLASSIFIED:new Set()};
  for(const unit of unique.values()) {
    const bucket=result[unit.category];
    days[unit.category].add(unit.date);
    if(unit.periodType==='TEACHING' && unit.period>0) bucket.teachingJp++;
    else bucket.otherJp++;
    bucket.totalJp++;
  }
  for (const category of ['PERSONAL','SCHOOL_DUTY','UNCLASSIFIED'] as const) result[category].days=days[category].size;
  return result;
}
