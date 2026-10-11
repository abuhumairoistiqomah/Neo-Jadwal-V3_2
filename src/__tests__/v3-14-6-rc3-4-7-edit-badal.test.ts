import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

it("Log Izin exposes edit action for desktop/mobile and preserves WhatsApp payload", () => {
  const ui = source("src/components/LogGuruPengganti.tsx");
  assert.match(ui, /edit-badal-\$\{log.id\}/);
  assert.match(ui, /edit-badal-mob-\$\{log.id\}/);
  assert.match(ui, /SearchableSelect/);
  assert.match(ui, /onReplaceSubstitute\(editingLog, newTeacherId/);
  assert.match(ui, /buildSubstituteReminderWhatsappMessage/);
  assert.match(ui, /getPublicScheduleUrl\(\)/);
});

it("Frontend writes substitute only and reloads the Supabase snapshot", () => {
  const app = source("src/App.tsx");
  const repository = source("src/infrastructure/repositories/supabaseInvalWriteRepository.ts");
  assert.match(app, /onReplaceSubstitute=\{handleReplaceLogSubstitute\}/);
  assert.match(app, /replaceSubstitute\(\{/);
  assert.match(app, /await refreshFromSupabase\(\)/);
  assert.match(repository, /ejadwal_replace_inval_substitute_v1/);
  assert.doesNotMatch(repository.split("async replaceSubstitute")[1].split("async deleteAssignment")[0], /p_task_text|learning_tasks/);
});

it("SQL edits same coverage row atomically, records before/after, and never alters tasks", () => {
  const sql = source("supabase/migrations/202610120002_v3_14_6_badal_reassignment.sql");
  assert.match(sql, /update public.coverage_slots/);
  assert.match(sql, /INVAL_SUBSTITUTE_CHANGED/);
  assert.match(sql, /LEGACY_INVAL_SUBSTITUTE_CHANGED/);
  assert.match(sql, /to_jsonb\(v_before\)/);
  assert.match(sql, /to_jsonb\(v_after\)/);
  assert.match(sql, /ejadwal_validate_substitute_constraints/);
  assert.match(sql, /current_user_has_role\('ADMIN'\)/);
  assert.doesNotMatch(sql, /update public.learning_tasks|delete from public.learning_tasks/i);
});

it("Manual legacy reassignment survives a later import, and cancelled logs remain protected", () => {
  const sql = source("supabase/migrations/202610120002_v3_14_6_badal_reassignment.sql");
  assert.match(sql, /legacy_substitute_manual_override/);
  assert.match(sql, /preserve_legacy_reassigned_substitute/);
  assert.match(sql, /new.substitute_teacher_id := old.substitute_teacher_id/);
  assert.match(source("supabase/migrations/202610120001_v3_14_6_legacy_cancel_leave_free_amendment.sql"), /preserve_legacy_cancelled_coverage/);
});
