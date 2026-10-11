import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../../supabase/migrations/202610120005_v3_14_6_dated_public_wa_contacts.sql");
const publicRepo = read("../infrastructure/repositories/supabasePublicScheduleRepository.ts");
const mapper = read("../infrastructure/repositories/supabaseScheduleMappers.ts");
const domain = read("../domain/models.ts");
const dashboard = read("../components/Dashboard.tsx");
const app = read("../App.tsx");

test("public RPC v3 is additive over task-enabled v2, not the unfiltered teacher directory", () => {
  assert.match(sql, /public\.ejadwal_public_schedule_snapshot_v2\(\)/);
  assert.match(sql, /jsonb_array_elements\(base\.payload->'coverageSlots'\)/);
  assert.match(sql, /jsonb_build_object\('coverageSlots', dated_coverage\.rows\)/);
  assert.doesNotMatch(sql, /jsonb_build_object\('teachers'|grant\s+select\s+on\s+public\.teachers/i);
  assert.match(publicRepo, /client\.rpc\("ejadwal_public_schedule_snapshot_v3"\)/);
});

test("server only emits current/future, uncancelled, non-expired dated teacher contacts", () => {
  assert.match(sql, /schedule_date'\)::date >= \(now\(\) at time zone 'Asia\/Jakarta'\)::date/);
  assert.match(sql, /item\.value->>'status' not in \('CANCELLED', 'EXPIRED'\)/);
  assert.match(sql, /when \(item\.value->>'schedule_date'\)::date >=/);
  assert.match(sql, /then absent\.whatsapp_e164 else null::text end/);
  assert.match(sql, /then substitute\.whatsapp_e164 else null::text end/);
  assert.match(sql, /revoke all on function public\.ejadwal_public_schedule_snapshot_v3\(\) from public/);
});

test("only per-coverage contact fields flow into logs, not global teacher directory", () => {
  assert.match(mapper, /whatsapp_guru_izin: row\.absent_teacher_whatsapp_e164 \|\| null/);
  assert.match(mapper, /whatsapp_guru_pengganti: row\.substitute_teacher_whatsapp_e164 \|\| null/);
  assert.match(domain, /whatsapp_guru_izin\?: string \| null/);
  assert.doesNotMatch(sql, /jsonb_set\([^\n]*whatsapp_e164/i);
});

test("Dashboard uses slot contact and blocks past-date contact even in stale browser", () => {
  assert.match(dashboard, /selectedDate < getSchoolTodayISO\(\)/);
  assert.match(dashboard, /item\.whatsapp_guru_izin \|\| \(isAdmin \? absentTeacher\?\.whatsapp_e164 : null\)/);
  assert.match(dashboard, /logsInSession\.find\(\(log\) => log\.whatsapp_guru_izin\)/);
  assert.match(app, /setLogs\(\(existing\) => existing\.map\(\(log\) => log\.tanggal < schoolToday/);
  assert.match(app, /\}, \[isAdmin, schoolToday\]\);/);
});
