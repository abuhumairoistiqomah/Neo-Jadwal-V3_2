import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIELD_TRIP_V319,previewDuty,warnDutyOverlaps,validateDutyDraft,suggestedCompensationDate,isIsoDay,type DutyAssignmentInput,type DutyEventInput} from '../domain/teacherDutyV319';
const teachers=['t1','t2','t3'];
const trip:DutyEventInput={...FIELD_TRIP_V319[0]};
const assignment=(role:DutyAssignmentInput['role']='PARTICIPANT',compensationDate:string|null=null):DutyAssignmentInput=>({teacherId:'t1',role,compensationDate});
test('RC2 Field Trip templates differ by group and allow individual compensation suggestions only',()=>{
 assert.deepEqual(FIELD_TRIP_V319.map(t=>t.scope),['IKHWAN','AKHWAT']);
 assert.equal(suggestedCompensationDate(FIELD_TRIP_V319[0]),'2026-09-22');
 assert.equal(suggestedCompensationDate(FIELD_TRIP_V319[1]),'2026-09-23');
 assert.equal(suggestedCompensationDate({...trip,title:'Other'}),null);
});
test('RC2 validates real ISO date, compensatory leave after event, and no automatic participation',()=>{
 assert.equal(isIsoDay('2026-02-30'),false);
 assert.equal(isIsoDay('2026-09-22'),true);
 assert.ok(validateDutyDraft(trip,[],teachers).length>0);
 assert.deepEqual(validateDutyDraft(trip,[assignment('PARTICIPANT','2026-09-22')],teachers),[]);
 assert.ok(validateDutyDraft(trip,[assignment('STAFF','2026-09-21')],teachers).length>0);
});
test('RC2 refuses simultaneous ON_DUTY and compensatory leave',()=>{
 assert.match(validateDutyDraft(trip,[assignment('REMAINS_ON_DUTY','2026-09-22')],teachers).join(' '),/tetap bertugas/i);
 assert.deepEqual(validateDutyDraft(trip,[assignment('REMAINS_ON_DUTY')],teachers),[]);
});
test('RC2 refuses duplicate teacher and foreign/inactive teacher',()=>{
 assert.ok(validateDutyDraft(trip,[assignment(),assignment()],teachers).length>0);
 assert.ok(validateDutyDraft(trip,[{teacherId:'unknown',role:'STAFF',compensationDate:null}],teachers).length>0);
});
test('RC2 preview counts eligible, remains working and compensatory independently',()=>{
 const p=previewDuty(trip,[assignment('PARTICIPANT','2026-09-22'),{teacherId:'t2',role:'REMAINS_ON_DUTY',compensationDate:null}],teachers);
 assert.deepEqual([p.total,p.eligible,p.compensatory,p.remainsOnDuty,p.warnings.length],[2,1,1,1,0]);
});
test('RC2 storage has staff-only RLS, transactional RPC, audit and no attendance/leave scheduling writes',()=>{
 const sql=readFileSync('supabase/migrations/202610200002_v3_19_rc2_teacher_duty.sql','utf8');
 const ui=readFileSync('src/components/TeacherDutyV319Admin.tsx','utf8');
 const cal=readFileSync('src/components/OperationalCalendarV319Admin.tsx','utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/current_user_is_staff\(\)/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/INSERT INTO public\.ejadwal_teacher_duty_assignments_v319/);
 assert.match(sql,/CREATE TRIGGER audit_teacher_duty_assignment_v319/);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.(?:leave_requests|schedule_master|substitute_constraints)\b/i);
 assert.match(ui,/window\.confirm\(/);
 assert.match(ui,/REMAINS_ON_DUTY/);
 assert.match(cal,/TeacherDutyV319Admin/);
});

test('RC2 warns on cross-event compensation/duty collision but does not silently block saving',()=>{
 const w=warnDutyOverlaps(trip,[assignment('PARTICIPANT','2026-09-23')],[{id:'ev2',title:'Manajemen',date_start:'2026-09-23',date_end:'2026-09-23',status:'ACTIVE'}],[{event_id:'ev2',teacher_id:'t1',duty_role:'REMAINS_ON_DUTY',compensation_date:null}],null,()=> 'Guru A');
 assert.equal(w.length,1);
 assert.match(w[0],/Guru A/);
 assert.equal(warnDutyOverlaps(trip,[assignment('STAFF')],[],[],null,()=> 'A').length,0);
});
