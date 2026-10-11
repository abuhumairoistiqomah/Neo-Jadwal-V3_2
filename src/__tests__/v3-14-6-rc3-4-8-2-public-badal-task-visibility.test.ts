import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const repo = read("../infrastructure/repositories/supabasePublicScheduleRepository.ts");
const mapper = read("../infrastructure/repositories/supabaseScheduleMappers.ts");
const dashboard = read("../components/Dashboard.tsx");
const sql = read("../../supabase/migrations/202610120004_v3_14_6_public_badal_tasks.sql");
const original = read("../../supabase/migrations/202610120003_v3_14_6_guest_supabase_read.sql");

test("guest uses upgraded Supabase public RPC and validates both task collections", () => {
  assert.match(repo, /client\.rpc\("ejadwal_public_schedule_snapshot_v3"\)/);
  // v3 adds per-coverage WA contacts; the baseline v2 task projection stays intact.
  assert.match(repo, /"learningTasks", "taskResources"/);
  assert.doesNotMatch(repo, /AppsScript|fetch\(/);
});

test("public v2 task data is scoped to current or future active badal slots", () => {
  assert.match(sql, /create or replace function public\.ejadwal_public_schedule_snapshot_v2\(\)/);
  assert.match(sql, /public\.ejadwal_public_schedule_snapshot_v1\(\) \|\| jsonb_build_object\(/);
  assert.match(sql, /join live_coverage cs on cs\.id = lt\.coverage_slot_id/);
  assert.match(sql, /join visible_tasks t on t\.id = tr\.task_id/);
  assert.match(sql, /cs\.deleted_at is null/);
  assert.match(sql, /cs\.status not in \('CANCELLED', 'EXPIRED'\)/);
  assert.match(sql, /'Asia\/Jakarta'/);
  assert.match(sql, /lt\.deleted_at is null/);
});

test("public API does not grant broad table privileges or expose leave reasons and staff phone numbers", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public\.ejadwal_public_schedule_snapshot_v2\(\) from public/);
  assert.match(sql, /grant execute on function public\.ejadwal_public_schedule_snapshot_v2\(\) to anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+(select|update|insert|delete)\s+on\s+(table\s+)?public\./i);
  assert.doesNotMatch(sql, /reason_snapshot|whatsapp_e164|leave_request_task_resources|public\.leave_requests/);
  assert.match(original, /''::text as reason_snapshot/);
  assert.match(original, /null::text as whatsapp_e164/);
});

test("guest task description and resource links reach the existing Dashboard task action", () => {
  assert.match(sql, /select lt\.id, lt\.coverage_slot_id, lt\.description/);
  assert.match(sql, /select tr\.id, tr\.task_id, tr\.resource_type, tr\.label, tr\.url/);
  assert.match(mapper, /tugas: taskTextForCoverage\(row\.id\)/);
  assert.match(mapper, /parts\.push\(description\)/);
  assert.match(mapper, /parts\.push\(url\)/);
  assert.match(dashboard, /Lihat Kegiatan Siswa \/ Tugas/);
  assert.match(dashboard, /Minta Tugas via WhatsApp/);
});

test("additive v2 preserves untouched v1 rollback path", () => {
  assert.doesNotMatch(sql, /create or replace function public\.ejadwal_public_schedule_snapshot_v1\(\)/);
  assert.match(original, /'learningTasks', '\[\]'::jsonb/);
});
