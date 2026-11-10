import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src = (path:string) => readFileSync(path,'utf8');

test('HF7: management can list/edit task password without embedding it in public snapshot',()=>{
  const ui=src('src/components/ApprovedLeaveMaintenanceAdmin.tsx');
  const repo=src('src/infrastructure/repositories/supabaseApprovedLeaveMaintenanceRepository.ts');
  assert.match(ui,/Password Tugas/);
  assert.match(ui,/Acak Ulang/);
  assert.match(ui,/saveTaskPassword\(row/);
  assert.match(repo,/ejadwal_list_leave_task_passwords_hf7/);
  assert.match(repo,/ejadwal_set_leave_task_password_hf7/);
});

test('HF7: ordinary users unlock by password only; authenticated staff bypass via server RPC',()=>{
  const ui=src('src/components/LateTaskCompletion.tsx');
  const repo=src('src/infrastructure/repositories/publicLateTaskRepository.ts');
  assert.match(ui,/type="password"/);
  assert.match(ui,/admin.*login|Admin.*Mode|admin.*login/i);
  assert.match(ui,/getCurrentUserContext\(\)/);
  assert.match(ui,/repository.unlockByTaskPassword\(/);
  assert.doesNotMatch(ui,/setLast4\(/);
  assert.match(repo,/ejadwal_unlock_leave_task_hf7/);
});

test('HF7: soft delete and restore automatically scroll to confirmation block',()=>{
  const ui=src('src/components/ApprovedLeaveMaintenanceAdmin.tsx');
  assert.match(ui,/removalRef=useRef/);
  assert.match(ui,/removalRef.current\?\.scrollIntoView/);
  assert.match(ui,/ref=\{removalRef\}/);
});

test('HF7: server access is role-checked, tokens are scoped, and password table is closed to guests',()=>{
  const sql=src('supabase/migrations/202611110002_v3_20_rc1_7_1_hf7_task_passwords.sql');
  assert.match(sql,/revoke all on table public.leave_task_passwords from public, anon, authenticated/i);
  assert.match(sql,/role in \('ADMIN','WAKASEK'\)/);
  assert.match(sql,/create trigger trg_ejadwal_seed_task_password_hf7/i);
  assert.match(sql,/on conflict\(leave_request_id\) do nothing/i);
  assert.match(sql,/lr\.status='APPROVED' and lr\.deleted_at is null/i);
  assert.match(sql,/lp\.schedule_date=p_schedule_date/);
  assert.match(sql,/lp\.period=p_period and lp\.period_type='TEACHING'/);
  assert.match(sql,/TASK_PASSWORD_TEMPORARILY_LOCKED/);
  assert.match(sql,/task_upload_token=null,task_upload_expires_at=null/);
  assert.match(sql,/grant execute on function public.ejadwal_unlock_leave_task_hf7\(text,date,smallint,text\) to anon, authenticated/i);
  assert.doesNotMatch(sql,/grant select on public\.leave_task_passwords/i);
});
