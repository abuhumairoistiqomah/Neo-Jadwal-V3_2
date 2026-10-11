import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/202610110052_v3_14_6_calendar_bulk_versioning.sql", "utf8");
const repository = readFileSync("src/infrastructure/repositories/operationalRulesRepository.ts", "utf8");

test("bulk academic events retain per-row audit but skip redundant snapshot", () => {
  assert.match(sql, /current_setting\('ejadwal\.calendar_bulk_mode', true\) = 'on'/);
  assert.match(sql, /new\.action like 'OPERATIONAL_RULE_%'/);
  assert.match(sql, /'ACADEMIC_EVENT_GROUP_PUBLISH'/);
  assert.match(sql, /public\.ejadwal_schedule_snapshot_v1\(\)/);
});

test("bulk academic event insert and prior revision update stay in one SQL RPC", () => {
  assert.match(sql, /create or replace function public\.ejadwal_save_academic_event_group_v2/);
  assert.match(sql, /update public\.academic_events set status = 'INACTIVE'/);
  assert.match(sql, /ACADEMIC_EVENT_REVISION_INCOMPLETE/);
  assert.match(repository, /client\.rpc\("ejadwal_save_academic_event_group_v2"/);
  assert.doesNotMatch(repository, /\.insert\(payload\)\.select\("id"\)/);
});

test("bulk status toggle also produces only one schedule version", () => {
  assert.match(sql, /create or replace function public\.ejadwal_set_academic_event_group_active_v2/);
  assert.match(repository, /client\.rpc\("ejadwal_set_academic_event_group_active_v2"/);
  assert.match(sql, /'ACADEMIC_EVENT_GROUP_STATUS'/);
});

test("bulk RPCs are staff-only and permissioned for authenticated users", () => {
  assert.equal((sql.match(/auth\.uid\(\) is null or not public\.current_user_is_staff\(\)/g) || []).length, 2);
  assert.match(sql, /grant execute on function public\.ejadwal_save_academic_event_group_v2/);
  assert.match(sql, /grant execute on function public\.ejadwal_set_academic_event_group_active_v2/);
});
