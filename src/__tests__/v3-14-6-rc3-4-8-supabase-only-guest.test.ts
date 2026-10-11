import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const app = src("../App.tsx");
const repo = src("../infrastructure/repositories/supabasePublicScheduleRepository.ts");
const sql = src("../../supabase/migrations/202610120003_v3_14_6_guest_supabase_read.sql");

test("RC3.4.8 guest schedules are loaded from a Supabase RPC, not GAS", () => {
  assert.match(app, /new SupabasePublicScheduleRepository\(\)\.loadPublicState\(\)/);
  assert.match(repo, /client\.rpc\("ejadwal_public_schedule_snapshot_v3"\)/);
  // v3 adds per-coverage WA contacts; the baseline v2 task projection stays intact.
  assert.doesNotMatch(app, /fetchFromAppsScript|publicGasBootstrappedRef|header-refresh-db-btn/);
  assert.match(app, /if \(!isAdmin\) \{/);
  assert.match(app, /void refreshPublicSupabase\(\)/);
});

test("RC3.4.8 both modes show a Supabase refresh control", () => {
  assert.match(app, /isAdmin \? refreshFromSupabase\(\) : refreshPublicSupabase\(\)/);
  assert.match(app, /id="header-refresh-supabase-btn"/);
  assert.doesNotMatch(app, /Segarkan Data dari Google Sheets/);
});

test("RC3.4.8 never uses persisted or fixture timetables as live data", () => {
  assert.match(app, /const \[teachers, setTeachers\] = useState<Teacher\[\]>\(\[\]\)/);
  assert.match(app, /clearRuntimeSnapshot\(\)/);
  assert.match(app, /snapshotError/);
  assert.match(app, /!snapshotLoading && !snapshotError/);
  assert.doesNotMatch(app, /INITIAL_SCHEDULES|setSchedules\(JSON\.parse|storedSchedules/);
  assert.doesNotMatch(app, /localStorage\.setItem\("db_schedules"/);
});

test("RC3.4.8 guest RPC projects read-only public information", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public\.ejadwal_public_schedule_snapshot_v1\(\) from public/);
  assert.match(sql, /grant execute on function public\.ejadwal_public_schedule_snapshot_v1\(\) to anon, authenticated/);
  assert.doesNotMatch(sql, /grant select on (table )?public\.(teachers|coverage_slots)/i);
  assert.match(sql, /null::text as whatsapp_e164/);
  assert.match(sql, /''::text as reason_snapshot/);
  assert.match(sql, /'learningTasks', '\[\]'::jsonb/);
  assert.match(sql, /'taskResources', '\[\]'::jsonb/);
  assert.match(sql, /'normalTeachingBlocks'/);
  assert.match(sql, /''::text as reason/);
});

test("RC3.4.8 keeps full staff Supabase read independent of public projection", () => {
  assert.match(app, /new SupabaseScheduleRepository\(\)\.loadSnapshot\(\)/);
  assert.match(app, /new SupabasePublicScheduleRepository\(\)\.loadPublicState\(\)/);
  assert.match(app, /\+\+snapshotRequestRef\.current/);
  assert.match(app, /setSubstituteConstraints\(\[\]\)/);
});
