import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getPublicScheduleUrl } from "../domain/whatsappPublicUrl";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

it("broadcast URL always uses public v3, never localhost/v1 or preview", () => {
  assert.equal(getPublicScheduleUrl("http://localhost:3000"), "https://neojadwalv3.vercel.app/");
  assert.equal(getPublicScheduleUrl("https://branch-preview.vercel.app"), "https://neojadwalv3.vercel.app/");
  assert.equal(getPublicScheduleUrl("https://neojadwalv3.vercel.app"), "https://neojadwalv3.vercel.app/");
  assert.match(source("src/components/LogGuruPengganti.tsx"), /getPublicScheduleUrl\(\)/);
  assert.doesNotMatch(source("src/components/LogGuruPengganti.tsx"), /neojadwalv1/);
});

it("legacy cancellation is audited and remains a soft delete", () => {
  const sql = source("supabase/migrations/202610120001_v3_14_6_legacy_cancel_leave_free_amendment.sql");
  assert.match(sql, /LEGACY_COVERAGE_SOFT_CANCEL/);
  assert.match(sql, /status = 'CANCELLED', deleted_at = now\(\), deleted_by = v_actor/);
  assert.match(sql, /current_user_has_role\('ADMIN'\)/);
  assert.match(sql, /to_jsonb\(v_before\)/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.coverage_slots/i);
});

it("legacy reimport does not resurrect cancelled imported rows", () => {
  const migration = source("src/infrastructure/migration/legacyMigrationRepository.ts");
  assert.match(migration, /cancelledLegacy/);
  assert.match(migration, /deleted_at: cancelledLegacy/);
});

it("existing leave correction only appends missing FREE JPs with audit", () => {
  const sql = source("supabase/migrations/202610120001_v3_14_6_legacy_cancel_leave_free_amendment.sql");
  assert.match(sql, /ejadwal_find_leave_free_amendment_v1/);
  assert.match(sql, /ejadwal_append_leave_free_periods_v1/);
  assert.match(sql, /FREE_PERIOD_HAS_TEACHING/);
  assert.match(sql, /LEAVE_FREE_PERIODS_APPENDED/);
  assert.match(sql, /v_req\.status not in \('SUBMITTED', 'APPROVED'\)/);
  assert.doesNotMatch(sql, /insert into public\.coverage_slots/i);
  const form = source("src/components/LeaveRequestForm.tsx");
  assert.match(form, /Tambahkan JP Free ke Izin Lama/);
  assert.match(form, /getCurrentUserContext/);
});
