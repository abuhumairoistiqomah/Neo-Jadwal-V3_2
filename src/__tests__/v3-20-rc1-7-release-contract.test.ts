import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=(p:string)=>readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');

test('RC1.7: correction writes through canonical leave requests and audits',()=>{
  const sql=src('supabase/migrations/202610300001_v3_20_rc1_7_leave_task_inval.sql');
  assert.match(sql,/UPDATE public\.leave_requests SET reason=/i);
  assert.match(sql,/UPDATE public\.coverage_slots SET reason_snapshot=/i);
  assert.match(sql,/RC17_LEAVE_REASON_CORRECT/);
  assert.match(sql,/RC17_MANUAL_INVAL_REASON_CORRECT/);
  assert.match(sql,/ACTIVE_APPROVED_LEAVE_REQUIRED/);
});

test('RC1.7: manual category captured in Input Inval and persisted atomically',()=>{
  const ui=src('src/components/InputGuruPengganti.tsx');
  const domain=src('src/domain/inval/invalWrite.ts');
  const sql=src('supabase/migrations/202610300001_v3_20_rc1_7_leave_task_inval.sql');
  assert.match(ui,/input-absence-category-rc17/);
  assert.match(ui,/absenceCategory: officialDutySlots \? "SCHOOL_DUTY" : absenceCategory/);
  assert.match(domain,/absence_category: input\.metadata\?\.absenceCategory/);
  assert.match(sql,/ABSENCE_CATEGORY_REQUIRED/);
  assert.match(sql,/UPDATE public\.coverage_slots SET absence_category=/);
  assert.match(sql,/v_result:=public\.ejadwal_save_inval_bundle_v320_rc13/);
});

test('RC1.7: management changes teacher-owned task with stale-edit protection',()=>{
  const sql=src('supabase/migrations/202610300001_v3_20_rc1_7_leave_task_inval.sql');
  assert.match(sql,/TASK_STALE_REFRESH_REQUIRED/);
  assert.match(sql,/UPDATE public\.leave_request_tasks SET description=/);
  assert.match(sql,/RC17_LEAVE_TASK_EDIT/);
  assert.doesNotMatch(sql,/DELETE FROM public\.leave_request_task_resources/i);
  assert.match(src('src/components/ApprovedLeaveMaintenanceAdmin.tsx'),/Simpan Tugas JP/);
});

test('RC1.7: reservations block overlapping room use on server and remain auditable',()=>{
  const sql=src('supabase/migrations/202610300002_v3_20_rc1_7_room_event_reservations.sql');
  for(const token of ['ROOM_TIME_CONFLICT','room_event_reservations','schedule_master','schedule_incidentals','room_unavailability','pg_advisory_xact_lock','RC17_ROOM_EVENT_CANCEL'])
    assert.ok(sql.includes(token),`missing ${token}`);
  assert.match(sql,/p_start<r\.end_time AND p_end>r\.start_time/);
  assert.match(src('src/components/WeeklyRoomEditor.tsx'),/Reservasi Event/);
});
