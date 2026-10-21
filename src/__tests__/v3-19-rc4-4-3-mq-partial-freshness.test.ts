import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildTeacherLeaveSlots, resolvePartialLeaveSelection } from '../domain/leaveRequest';
import { activeMqTransferMatches, eligibleMqReceivingClasses, mqTransfersForRegularGroup } from '../domain/schedule/mqStudentTransfer';
import { collectPriorityDuties, resolveDisplacedTeacher } from '../domain/schedule/dutyResolution';
import { absentCoverageLabel, findAbsentTeacherCoverage } from '../domain/schedule/absentTeacherCoverage';

const date='2026-10-19';
const src=(name:string)=>readFileSync(resolve('src',name),'utf8');
const master=(kelas:string,period:number,guru:string,mapel='Al-Qur\'an')=>({
  id:`${kelas}-${period}`,kelas,hari:'Senin',jam_ke:period,mulai:'08:40',selesai:'09:40',mapel,
  guru1:guru,guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',kelasgabung:'Tidak',
});
const fixture=[master('01 MQ AKHWAT',1,'SELIS'),master('02 MQ AKHWAT',2,'OTHER'),master('03 MQ AKHWAT',3,'SELIS'),master('04 MQ AKHWAT',4,'OTHER')];

test('RC4.4.3 partial starts empty; bridged FREE JP selected, then released with endpoint',()=>{
  const slots=buildTeacherLeaveSlots({teacherName:'SELIS',scheduleDate:date,schedules:fixture});
  assert.equal(slots.find(s=>s.period===2)?.periodType,'FREE');
  const explicit=new Set<string>();
  assert.equal(resolvePartialLeaveSelection(slots,explicit).size,0);
  const one=slots.find(s=>s.period===1)!;
  const three=slots.find(s=>s.period===3)!;
  explicit.add(one.key);
  assert.equal(resolvePartialLeaveSelection(slots,explicit).has(`${date}|JP2`),false);
  explicit.add(three.key);
  assert.equal(resolvePartialLeaveSelection(slots,explicit).has(`${date}|JP2`),true);
  assert.equal(resolvePartialLeaveSelection(slots,explicit).has(`${date}|JP4`),false);
  explicit.delete(three.key);
  assert.equal(resolvePartialLeaveSelection(slots,explicit).has(`${date}|JP2`),false);
});

test('RC4.4.3 explicit FREE outside the leave interval is retained; JP0 not auto-selected',()=>{
  const slots=buildTeacherLeaveSlots({teacherName:'SELIS',scheduleDate:date,schedules:fixture});
  const explicit=new Set([`${date}|JP1`,`${date}|JP3`,`${date}|JP4`]);
  const result=resolvePartialLeaveSelection(slots,explicit);
  assert.equal(result.has(`${date}|JP0`),false);
  assert.equal(result.has(`${date}|JP2`),true);
  assert.equal(result.has(`${date}|JP4`),true);
});

test('RC4.4.3 effective leave includes dated teacher reassignment and subject over master',()=>{
  const slots=buildTeacherLeaveSlots({teacherName:'SELIS',scheduleDate:date,schedules:fixture,jadwalInsidental:[{
    id:'inc2',tanggal:date,kelas:'02 MQ AKHWAT',jam_ke:2,mapel:'Tahsin',guru1:'SELIS',
    guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',ruangan:'',replaceTeachers:true,
  }]});
  const jp2=slots.find(s=>s.period===2);
  assert.equal(jp2?.periodType,'TEACHING');
  assert.equal(jp2?.subject,'Tahsin');
  assert.equal(jp2?.source,'INCIDENTAL_OVERRIDE');
  assert.equal(jp2?.assignments[0]?.classCode,'02 MQ AKHWAT');
});

const reg=(mapel="Al-Qur'an")=>[{
  jam_ke:5,mapel,mulai:'13:00',selesai:'14:00',
  items:[{kelas:'02 MQ AKHWAT',jam_ke:5,isActive:true,effectiveTeachers:['SELIS']},{kelas:'03 MQ AKHWAT',jam_ke:5,isActive:true,effectiveTeachers:['SELIS']}],
}] as any;
const badal={jam_ke:5,mapel:"Al-Qur'an",kelas:'04 MQ AKHWAT',mulai:'13:00',selesai:'14:00',coverageIds:['cover04']};
const log={id:'cover04',tanggal:date,guru_pengganti:'SELIS',guru_izin:'SHINTA',kelas:'04 MQ AKHWAT',jam_ke:5,mapel:"Al-Qur'an"} as any;
const acknowledge={id:'merge04',coverage_slot_id:'cover04',schedule_date:date,period:5,receiving_class_name:'02 MQ AKHWAT',source_class_name:'04 MQ AKHWAT',receiving_teacher_name:'SELIS'};

test('RC4.4.3 MQ candidate requires exact period, subject, clock, and MQ class',()=>{
  assert.deepEqual(eligibleMqReceivingClasses(badal,reg()),['02 MQ AKHWAT','03 MQ AKHWAT']);
  assert.deepEqual(eligibleMqReceivingClasses({...badal,mapel:'Mathematics'},reg()),[]);
  assert.deepEqual(eligibleMqReceivingClasses({...badal,mulai:'11:00'},reg()),[]);
  assert.deepEqual(eligibleMqReceivingClasses({...badal,kelas:'04 INTER 1 I'},reg()),[]);
});

test('RC4.4.3 MQ confirmation is ignored if recipient, coverage, class or subject changes',()=>{
  const args={records:[acknowledge],logs:[log],teacherName:'SELIS',date,regular:reg(),badalGroups:[badal]};
  assert.equal(activeMqTransferMatches(args).length,1);
  assert.equal(activeMqTransferMatches({...args,logs:[]}).length,0);
  assert.equal(activeMqTransferMatches({...args,badalGroups:[{...badal,mulai:'15:00'}]}).length,0);
  assert.equal(activeMqTransferMatches({...args,logs:[{...log,guru_pengganti:'OTHER'}]}).length,0);
  assert.equal(activeMqTransferMatches({...args,logs:[{...log,mapel:'Mathematics'}]}).length,0);
  assert.equal(activeMqTransferMatches({...args,regular:reg('Mathematics')}).length,0);
  assert.equal(activeMqTransferMatches({...args,regular:[{...reg()[0],items:[{...reg()[0].items[0],effectiveTeachers:['OTHER']}]}]}).length,0);
  assert.equal(activeMqTransferMatches({...args,records:[{...acknowledge,receiving_class_name:'11 MQ IKHWAN'}]}).length,0);
});

test('RC4.4.3 form refreshes public Supabase snapshot without parent component unmount',()=>{
  const form=src('components/LeaveRequestForm.tsx');
  assert.match(form,/new SupabasePublicScheduleRepository\(\)\.loadPublicState\(\)/);
  assert.match(form,/scheduleLoading \|\| scheduleError \|\| !freshSchedule/);
  assert.match(form,/setExplicitSelectedKeys\(new Set\(\)\)/);
  assert.match(form,/Perbarui jadwal/);
  assert.match(form,/resolvePartialLeaveSelection/);
});

test('RC4.4.3 persistence has RLS, permission check and a unique migration version',()=>{
  const migration=src('../supabase/migrations/202610210005_v3_19_rc4_4_3_mq_student_transfer.sql');
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/current_user_is_staff\(\)/);
  assert.match(migration,/TRANSFER_RECEIVER_NOT_SCHEDULED/);
  assert.match(migration,/TRANSFER_DIFFERENT_OR_MISSING_SUBJECT/);
  assert.match(migration,/WHERE deleted_at IS NULL/);
  const filenames=readdirSync(resolve('supabase/migrations')).filter(name=>name.endsWith('.sql'));
  assert.equal(filenames.filter(name=>name.startsWith('202610210005_')).length,1);
});

test('RC4.4.3 MQ confirmed badal is filtered by coverage ID, not all same-period conflicts',()=>{
  const own={...master('02 MQ AKHWAT',5,'SELIS'),tanggal:date,source:'MASTER',isActive:true,
    scheduledTeachers:['SELIS'],absentTeachers:[],substituteTeachers:[],effectiveTeachers:['SELIS']};
  const priority=collectPriorityDuties({date,effective:[own] as any,logs:[log]});
  assert.equal(priority.length,1);
  assert.equal(priority[0].coverageId,'cover04');
  assert.equal(resolveDisplacedTeacher({original:own as any,teacherName:'SELIS',priorityDuties:priority})?.kind,'PRIMARY_CONFLICT');
  const approved=new Set(['cover04']);
  const filtered=priority.filter(d=>d.kind!=='BADAL' || !d.coverageId || !approved.has(d.coverageId));
  assert.equal(resolveDisplacedTeacher({original:own as any,teacherName:'SELIS',priorityDuties:filtered}),null);
});

test('RC4.4.3 dashboard makes transfer optional, auditable, and leaves badal history untouched',()=>{
  const dashboard=src('components/Dashboard.tsx');
  assert.match(dashboard,/Konfirmasi gabung/);
  assert.match(dashboard,/Batalkan penggabungan/);
  assert.match(dashboard,/confirmedMqTransfers/);
  assert.match(dashboard,/invalSchedules\.filter\(inv =>/);
  const sql=src('../supabase/migrations/202610210005_v3_19_rc4_4_3_mq_student_transfer.sql');
  assert.match(sql,/TRANSFER_RECEIVER_UNAVAILABLE/);
  assert.match(sql,/TRANSFER_DIFFERENT_CLOCK/);
  assert.doesNotMatch(sql,/DELETE\s+FROM\s+public\.coverage_slots/i);
});


// RC4.4.4: the absent teacher must still see WHO handles each affected class.
test('RC4.4.4 absent teacher sees confirmed substitute by exact date, class, JP and teacher',()=>{
  const rows=[
    {id:'a',tanggal:date,jam_ke:3,kelas:'10 AE 1 I',guru_izin:'MUHAMMAD HUSEIN HAIKAL',guru_pengganti:'MUAMMAR',coverage_status:'ASSIGNED'},
    {id:'b',tanggal:date,jam_ke:3,kelas:'11 AE 1 I',guru_izin:'MUHAMMAD HUSEIN HAIKAL',guru_pengganti:'UKASYAH',coverage_status:'ASSIGNED'},
    {id:'c',tanggal:date,jam_ke:3,kelas:'10 AE 1 I',guru_izin:'OTHER',guru_pengganti:'WRONG',coverage_status:'ASSIGNED'},
    {id:'d',tanggal:date,jam_ke:3,kelas:'10 AE 1 I',guru_izin:'MUHAMMAD HUSEIN HAIKAL',guru_pengganti:'STALE',coverage_status:'CANCELLED'},
  ] as any[];
  const query=(classes:string[],dateArg=date)=>findAbsentTeacherCoverage({date:dateArg,period:3,
    teacherName:' muhammad   husein haikal ',classes:classes.map(kelas=>({kelas,jam_ke:3})),logs:rows});
  assert.deepEqual(query(['10 AE 1 I']).map(x=>x.guru_pengganti),['MUAMMAR']);
  assert.deepEqual(query(['10 AE 1 I','11 AE 1 I']).map(x=>x.guru_pengganti),['MUAMMAR','UKASYAH']);
  assert.deepEqual(query(['08 AE 1 I']),[]);
  assert.deepEqual(query(['10 AE 1 I'],'2026-10-22'),[]);
  assert.equal(absentCoverageLabel(rows[0]),'Digantikan oleh: MUAMMAR');
});

test('RC4.4.4 no-badal is distinguished from waiting and untrusted legacy records',()=>{
  const base={id:'a',tanggal:date,jam_ke:3,kelas:'10 AE 1 I',guru_izin:'HUSEIN',guru_pengganti:''} as any;
  assert.equal(absentCoverageLabel({...base,coverage_status:'NO_SUBSTITUTE',source:'OFFICIAL_DUTY'}),
    'Ditangani team teaching (tanpa badal tambahan)');
  assert.equal(absentCoverageLabel({...base,coverage_status:'NO_SUBSTITUTE',source:'IMPORT_LEGACY'}),'Badal belum ditentukan');
  assert.equal(absentCoverageLabel({...base,coverage_status:'WAITING'}),'Badal belum ditentukan');
  assert.equal(absentCoverageLabel({...base,coverage_status:'ASSIGNED',guru_pengganti:'UKASYAH'}),'Digantikan oleh: UKASYAH');
});

test('RC4.4.4 dashboard displays matched coverage inside unavailable regular teacher cards',()=>{
  const source=src('components/Dashboard.tsx');
  assert.match(source,/findAbsentTeacherCoverage\(\{/);
  assert.match(source,/teacherName: selectedTeacher/);
  assert.match(source,/classes: item\.items/);
  assert.match(source,/aria-label="Informasi guru pengganti"/);
  assert.match(source,/absentCoverageLabel\(log\)/);
});

// RC4.4.5 regression: confirmed JP5 delegation never extends to JP1–4.
test('RC4.4.5 MQ delegation only affects its exact period, even when receiving class repeats all day',()=>{
  const groups=Array.from({length:5},(_,i)=>({
    jam_ke:i+1, mapel:"Al-Qur'an", mulai:'13:00', selesai:'14:00',
    items:[{kelas:'02 MQ AKHWAT',jam_ke:i+1,isActive:true,effectiveTeachers:['SELIS']},
      {kelas:'03 MQ AKHWAT',jam_ke:i+1,isActive:true,effectiveTeachers:['SELIS']}],
  }));
  const matches=groups.map(group=>mqTransfersForRegularGroup([acknowledge],group));
  assert.deepEqual(matches.map(x=>x.length),[0,0,0,0,1]);
  assert.equal(matches[4][0].source_class_name,'04 MQ AKHWAT');
  assert.deepEqual(mqTransfersForRegularGroup([{...acknowledge,receiving_class_name:'99 MQ AKHWAT'}],groups[4]),[]);
});

test('RC4.4.5 dashboard renders the filtered delegation only on the matching JP card',()=>{
  const dashboard=src('components/Dashboard.tsx');
  assert.match(dashboard,/mqTransfersForRegularGroup\(confirmedMqTransfers, reg\)/);
  assert.doesNotMatch(dashboard,/confirmedMqTransfers\.filter\(record => reg\.items\.some/);
});
