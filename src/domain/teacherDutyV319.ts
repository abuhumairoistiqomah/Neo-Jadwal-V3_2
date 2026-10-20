/** V3.19 RC2 – planned activity/compensatory leave, never physical attendance. */
export type DutyRole = 'PARTICIPANT' | 'STAFF' | 'REMAINS_ON_DUTY';
export type DutyScope = 'IKHWAN' | 'AKHWAT' | 'ALL' | 'OTHER';
export interface DutyEventInput {
  title: string;
  dateStart: string;
  dateEnd: string;
  scope: DutyScope;
  notes: string;
}
export interface DutyAssignmentInput {
  teacherId: string;
  role: DutyRole;
  compensationDate: string | null;
}
export interface DutyPreview {
  total: number;
  eligible: number;
  compensatory: number;
  remainsOnDuty: number;
  warnings: string[];
}
export const isIsoDay = (s:string): boolean => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
};
export function validateDutyDraft(event:DutyEventInput, assignments:DutyAssignmentInput[], knownTeacherIds:readonly string[]):string[] {
  const errors:string[]=[];
  if(!event.title.trim()||event.title.trim().length>180)errors.push('Nama kegiatan wajib 1–180 karakter.');
  if(!isIsoDay(event.dateStart)||!isIsoDay(event.dateEnd)||event.dateEnd<event.dateStart)errors.push('Tanggal kegiatan tidak valid.');
  if(!['IKHWAN','AKHWAT','ALL','OTHER'].includes(event.scope))errors.push('Cakupan kegiatan tidak valid.');
  if(event.notes.length>2000)errors.push('Catatan maksimal 2000 karakter.');
  if(assignments.length===0)errors.push('Pilih minimal satu guru dengan status penugasan eksplisit.');
  if(assignments.length>500)errors.push('Maksimal 500 guru per kegiatan.');
  const seen=new Set<string>();
  const validTeachers=new Set(knownTeacherIds);
  for(const item of assignments){
    if(!validTeachers.has(item.teacherId))errors.push('Ada guru yang tidak lagi aktif/terdaftar.');
    if(seen.has(item.teacherId))errors.push('Guru yang sama tidak boleh dua kali dalam satu kegiatan.');
    seen.add(item.teacherId);
    if(!['PARTICIPANT','STAFF','REMAINS_ON_DUTY'].includes(item.role))errors.push('Jenis penugasan tidak valid.');
    if(item.compensationDate!==null){
      if(item.role==='REMAINS_ON_DUTY')errors.push('Guru tetap bertugas tidak boleh sekaligus menerima libur pengganti.');
      if(!isIsoDay(item.compensationDate)||item.compensationDate<=event.dateEnd)errors.push('Libur pengganti harus pada tanggal yang valid setelah kegiatan selesai.');
    }
  }
  return [...new Set(errors)];
}
export function previewDuty(event:DutyEventInput,assignments:DutyAssignmentInput[],knownTeacherIds:readonly string[]):DutyPreview {
  return {
    total:assignments.length,
    eligible:assignments.filter(a=>a.role!=='REMAINS_ON_DUTY').length,
    compensatory:assignments.filter(a=>a.compensationDate!==null).length,
    remainsOnDuty:assignments.filter(a=>a.role==='REMAINS_ON_DUTY').length,
    warnings:validateDutyDraft(event,assignments,knownTeacherIds)
  };
}
export const FIELD_TRIP_V319:ReadonlyArray<DutyEventInput>=[
  {title:'Field Trip Ikhwan',dateStart:'2026-09-21',dateEnd:'2026-09-21',scope:'IKHWAN',notes:'Hanya guru yang benar-benar menjadi peserta/staf. Libur pengganti per guru; bukan otomatis berdasarkan kelas yang diajar.'},
  {title:'Field Trip Akhwat',dateStart:'2026-09-22',dateEnd:'2026-09-22',scope:'AKHWAT',notes:'Guru yang ditetapkan tetap bertugas harus dipilih eksplisit; tidak menerima libur pengganti otomatis.'}
];
export function suggestedCompensationDate(event:DutyEventInput):string|null {
  if(event.title==='Field Trip Ikhwan'&&event.dateStart==='2026-09-21')return '2026-09-22';
  if(event.title==='Field Trip Akhwat'&&event.dateStart==='2026-09-22')return '2026-09-23';
  return null;
}

/** Advisory RC2 only: overlap detection. RC3 will make authoritative availability decisions. */
export function warnDutyOverlaps(
  draft:DutyEventInput,
  assignments:DutyAssignmentInput[],
  existingEvents:ReadonlyArray<{id:string;date_start:string;date_end:string;status:string;title:string}>,
  existingAssignments:ReadonlyArray<{event_id:string;teacher_id:string;duty_role:DutyRole;compensation_date:string|null}>,
  editedEventId:string|null,
  teacherName:(id:string)=>string
):string[] {
  const warnings:string[]=[];
  for(const a of assignments){
    for(const event of existingEvents){
      if(event.id===editedEventId||event.status!=='ACTIVE')continue;
      const others=existingAssignments.filter(x=>x.event_id===event.id&&x.teacher_id===a.teacherId);
      for(const other of others){
        const dateCollision=a.compensationDate!==null && a.compensationDate>=event.date_start&&a.compensationDate<=event.date_end;
        const reverseCollision=other.compensation_date!==null && other.compensation_date>=draft.dateStart&&other.compensation_date<=draft.dateEnd;
        const duplicateComp=a.compensationDate!==null&&a.compensationDate===other.compensation_date;
        if(dateCollision||reverseCollision||duplicateComp){
          warnings.push(`${teacherName(a.teacherId)}: cek benturan libur pengganti dengan ${event.title} (${event.date_start}–${event.date_end}).`);
        }
      }
    }
  }
  return [...new Set(warnings)];
}
