import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/202610230006_v3_20_rc1_5_2_faithful_incidental_copy.sql", "utf8");
const admin = readFileSync("src/components/IncidentalScheduleAdmin.tsx", "utf8");
const mapper = readFileSync("src/infrastructure/repositories/supabaseScheduleMappers.ts", "utf8");
const repo = readFileSync("src/infrastructure/repositories/scheduleAdminRepository.ts", "utf8");
const panel = readFileSync("src/components/IncidentalCopyPanel.tsx", "utf8");

test("RC1.5.2: RPC copies the source reason/type, no COPY_* in visible columns", () => {
  assert.match(sql, /reason = v_source.reason/);
  assert.match(sql, /incidental_type = v_source.incidental_type/);
  assert.match(sql, /v_source.reason, v_source.incidental_type, v_source.id/);
  assert.doesNotMatch(sql, /'Salin jadwal insidental dari ' \|\| v_source_name/);
  assert.doesNotMatch(sql, /'COPY_INCIDENTAL_RC152'/);
});

test("RC1.5.2: combined flag, mode, inherited note and clock copied", () => {
  assert.match(sql, /override_is_combined = \(v_source_mode = 'COMBINED'\)/);
  assert.match(sql, /override_class_mode = v_source_mode/);
  assert.match(sql, /override_special_note = v_source_note/);
  assert.match(sql, /v_source_master.class_mode/);
  assert.match(sql, /v_source_master.special_note/);
  assert.match(sql, /v_source_master.start_time/);
});

test("RC1.5.2: technical provenance separated from user-visible schedule descriptions", () => {
  assert.match(sql, /add column if not exists copied_from_incidental_id uuid null/);
  assert.match(mapper, /copiedFromIncidentalId: row.copied_from_incidental_id/);
  assert.match(admin, /row.copiedFromIncidentalId/);
  assert.match(repo, /ejadwal_copy_incidental_lessons_v320_rc152/);
  assert.match(panel, /status kelas gabungan/);
});

test("RC1.5.2: legacy cleanup is guarded by two original markers and writes audit", () => {
  assert.match(sql, /dest.incidental_type like 'COPY_INCIDENTAL_RC15%'/);
  assert.match(sql, /dest.reason like 'Salin jadwal insidental dari %'/);
  assert.match(sql, /NORMALIZE_LEGACY_COPY_METADATA_RC152/);
  assert.match(sql, /src.deleted_at is null/);
});

test("RC1.5.2: same atomic/admin protections and no weekly master modification", () => {
  assert.match(sql, /ADMIN_OR_WAKASEK_REQUIRED/);
  assert.match(sql, /COPY_TARGET_HAS_ACTIVE_BADAL/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /source_room_not_copied/);
  assert.doesNotMatch(sql, /update public.schedule_master\b/i);
});
