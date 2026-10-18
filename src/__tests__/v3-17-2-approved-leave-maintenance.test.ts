import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {approvedLeaveVisible,approvedLeaveEditableSessions,explainApprovedLeaveDatabaseError} from '../domain/approvedLeaveMaintenance.ts';
import {getTeacherWeekSlotAnnotations} from '../domain/schedule/teacherWeeklyPresentation.ts';
const read=(f:string)=>readFileSync(f,'utf8');

test('list hides past dates and soft-deleted requests by default, but keeps events ending today',()=>{
  const rows=[
    {dateEnd:'2026-10-17',deleted:false,id:'past'},
    {dateEnd:'2026-10-18',deleted:false,id:'today'},
    {dateEnd:'2026-10-20',deleted:true,id:'deleted'},
  ];
  assert.deepEqual(approvedLeaveVisible(rows,'2026-10-18').map(x=>x.id),['today']);
  assert.deepEqual(approvedLeaveVisible(rows,'2026-10-18',true).map(x=>x.id),['past','today']);
  assert.deepEqual(approvedLeaveVisible(rows,'2026-10-18',false,true).map(x=>x.id),['today','deleted']);
  assert.equal(approvedLeaveVisible(rows,'2026-10-18',true,true).length,3);
});

test('joined classes share one edit button per date and JP',()=>{
  const slots=[
    {scheduleDate:'2026-10-21',period:2,deleted:false},
    {scheduleDate:'2026-10-21',period:2,deleted:false},
    {scheduleDate:'2026-10-21',period:3,deleted:false},
    {scheduleDate:'2026-10-21',period:5,deleted:true},
  ];
  assert.deepEqual(approvedLeaveEditableSessions(slots),[{date:'2026-10-21',period:2},{date:'2026-10-21',period:3}]);
});

test('official-duty leave rows use absence-red rather than purple and remain labeled not teaching',()=>{
  const view=read('src/components/JadwalLengkap.tsx');
  assert.match(view,/weekStatus === "TUGAS_RESMI"\)\) cellClasses = "bg-rose-100 text-red-900 border-l-4 border-l-red-600/);
  // V3.17.3 RC2 moved the label to the shared desktop/mobile presentation
  // helper. Assert the rendered meaning, not a hard-coded string location.
  assert.deepEqual(getTeacherWeekSlotAnnotations([
    {weekStatus:'TUGAS_RESMI',weekDetail:'Mengawas TKA',keterangan_khusus:''},
  ],'EFFECTIVE').statusLabels,['TUGAS SEKOLAH — TIDAK MENGAJAR']);
  assert.match(view,/getTeacherWeekSlotAnnotations\(items, scheduleMode\)/);
  assert.match(view,/weekStatus === "BADAL"\)\) cellClasses = "bg-amber/);
});

test('admin list uses staff auth, server RPC and two independent visibility toggles',()=>{
  const ui=read('src/components/ApprovedLeaveMaintenanceAdmin.tsx');
  const repo=read('src/infrastructure/repositories/supabaseApprovedLeaveMaintenanceRepository.ts');
  assert.match(ui,/getCurrentUserContext\(\)/);
  assert.match(ui,/role==='ADMIN'\|\|role==='WAKASEK'/);
  assert.match(ui,/setShowPast/); assert.match(ui,/setShowDeleted/);
  assert.match(ui,/approvedLeaveEditableSessions/);
  assert.match(repo,/ejadwal_move_approved_leave_period_v1/);
  assert.match(repo,/ejadwal_soft_delete_approved_leave_v1/);
  assert.match(repo,/ejadwal_restore_approved_leave_v1/);
});

test('SQL enforces authenticated staff, transaction-level correction and audited soft delete/restore',()=>{
  const sql=read('supabase/migrations/202610180002_v3_17_2_leave_maintenance_staff_submission.sql');
  assert.match(sql,/auth.uid\(\)/);
  assert.match(sql,/public.current_user_is_staff\(\)/);
  assert.match(sql,/revoke all on function public.ejadwal_submit_staff_leave_v1[\s\S]+?from public, anon/);
  assert.match(sql,/ejadwal_teacher_scheduled_for_leave_slot/);
  assert.match(sql,/ejadwal_validate_substitute_constraints/);
  assert.match(sql,/MULTI_DAY_TASK_CORRECTION_UNSUPPORTED/);
  assert.match(sql,/update public.leave_request_slots\s+set period=p_new_period,subject_snapshot/);
  assert.match(sql,/update public.leave_request_periods set period=p_new_period/);
  assert.match(sql,/update public.leave_request_tasks set period=p_new_period/);
  assert.match(sql,/STAFF_LEAVE_EVIDENCE_EXCEPTION/);
  assert.match(sql,/APPROVED_LEAVE_SOFT_DELETED/);
  assert.match(sql,/APPROVED_LEAVE_RESTORED/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.leave_requests/i);
  assert.doesNotMatch(sql,/grant execute[^;]+to anon/i);
});

test('public proof requirement unchanged; direct staff submission is explicitly opt-in to approval',()=>{
  const form=read('src/components/LeaveRequestForm.tsx');
  const migration=read('supabase/migrations/202610180002_v3_17_2_leave_maintenance_staff_submission.sql');
  assert.match(form,/!staffDirect && !evidenceFile/);
  assert.match(form,/submitStaffLeaveRequest\(payload,staffApproveNow,staffOralNote\)/);
  assert.match(form,/Catatan persetujuan lisan wajib diisi/);
  assert.match(migration,/p_approve_now boolean default false/);
  assert.match(migration,/ejadwal_decide_leave_request\(v_request_id,'APPROVE',v_note\)/);
  assert.match(migration,/ORAL_AUTHORIZATION_NOTE_REQUIRED/);
});


test('migration mismatch is explicit, and failed loads never present an empty-list claim',()=>{
  const error=explainApprovedLeaveDatabaseError('column leave_requests.deleted_at does not exist');
  assert.match(error,/Skema Supabase belum sesuai V3\.17\.2/);
  assert.match(error,/202610180002_v3_17_2_leave_maintenance_staff_submission\.sql/);
  assert.match(error,/bukan kosong/);
  assert.equal(explainApprovedLeaveDatabaseError('permission denied'), 'permission denied');
  const ui=read('src/components/ApprovedLeaveMaintenanceAdmin.tsx');
  assert.match(ui,/setLoadFailed\(true\)/);
  assert.match(ui,/loadFailed\?<div role="status"/);
});


test('every SQL migration has a unique timestamp version',()=>{
  const names=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql'));
  const versionCounts=new Map<string,number>();
  for(const name of names) {
    const version=name.split('_')[0];
    versionCounts.set(version,(versionCounts.get(version)||0)+1);
  }
  assert.deepEqual([...versionCounts].filter(([,count])=>count>1),[]);
  assert.ok(names.includes('202610180001_v3_16_2_education_calendar_soft_delete.sql'));
  assert.ok(names.includes('202610180002_v3_17_2_leave_maintenance_staff_submission.sql'));
});
