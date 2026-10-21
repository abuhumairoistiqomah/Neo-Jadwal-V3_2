import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/202610210003_v3_19_rc4_3_constraint_soft_delete_cascade.sql', 'utf8');
const admin = readFileSync('src/components/SubstituteConstraintAdmin.tsx', 'utf8');
const repo = readFileSync('src/infrastructure/repositories/operationalRulesRepository.ts', 'utf8');

// Protect the precise link to the originating official-duty rule; NEVER delete
// every substitute row simply because it names the same absent teacher.
test('RC4.3: only FK-linked official-duty coverage is soft-deleted', () => {
  assert.match(sql, /cs\.official_duty_constraint_id = new\.id/);
  assert.match(sql, /cs\.source = 'OFFICIAL_DUTY'/);
  assert.match(sql, /deleted_previous_status = cs\.status/);
  assert.match(sql, /status = 'CANCELLED'/);
  assert.match(sql, /deleted_at = now\(\)/);
  assert.doesNotMatch(sql, /delete from public\.coverage_slots/i);
  assert.doesNotMatch(sql, /(?:update|delete from) public\.(?:leave_requests|schedule_master|schedule_incidentals)\b/i);
});

test('RC4.3: disabling a rule through any client triggers cascade', () => {
  assert.match(sql, /create trigger ejadwal_clear_disabled_constraint_coverage_v319/);
  assert.match(sql, /after update on public\.substitute_constraints/);
  assert.match(sql, /new\.is_active = false or new\.deleted_at is not null/);
  assert.match(sql, /update public\.learning_tasks lt/);
  assert.match(sql, /RESTRICTION_COVERAGE_AUTO_SOFT_DELETE/);
});

test('RC4.3: staff-only RPC locks rule, audits, requires reason and never auto-restores badal', () => {
  assert.match(sql, /public\.current_user_is_staff\(\)/);
  assert.match(sql, /where id = p_constraint_id for update/);
  assert.match(sql, /RESTRICTION_CHANGE_REASON_REQUIRED/);
  assert.match(sql, /SUBSTITUTE_CONSTRAINT_/);
  assert.match(sql, /'RESTORE'/);
  assert.match(sql, /set deleted_at = null, deleted_by = null, is_active = false/);
  assert.doesNotMatch(sql, /set deleted_at = null[^;]*?coverage_slots/is);
});

test('RC4.3: migration reconciles old NONAKTIF rows without touching unrelated coverage', () => {
  assert.match(sql, /create temp table rc43_orphaned_slots/);
  assert.match(sql, /sc\.is_active = false or sc\.deleted_at is not null/);
  assert.match(sql, /cs\.official_duty_constraint_id/);
  assert.match(sql, /RC4_3_REPAIR_ORPHAN_OFFICIAL_DUTY_COVERAGE/);
});

test('RC4.3: UI exposes Soft Delete, history, restore and reloads coverage after mutation', () => {
  assert.match(admin, /Soft Delete/);
  assert.match(admin, /Lihat soft delete/);
  assert.match(admin, /Pulihkan \(Nonaktif\)/);
  assert.match(admin, /window\.prompt\(/);
  assert.match(admin, /badalRepository\.listAllAssignments\(\)/);
  assert.match(admin, /changeRule\(row, row\.is_active \? "DEACTIVATE" : "ACTIVATE"\)/);
  assert.match(repo, /ejadwal_change_substitute_constraint_v319/);
  assert.match(repo, /listSubstituteConstraints\(includeDeleted = false\)/);
});
