import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceExtension, evidenceUploadMimeMatches } from "../domain/managementLeaveEvidence";

const source = (p: string) => readFileSync(p, "utf8");

test("management screenshot validates type and size", () => {
  assert.equal(evidenceExtension({ type: "image/png", size: 12000 }), "png");
  assert.equal(evidenceExtension({ type: "image/jpeg", size: 12 }), "jpg");
  assert.throws(() => evidenceExtension({ type: "application/pdf", size: 12000 }), /gambar JPG/);
  assert.throws(() => evidenceExtension({ type: "image/png", size: 6*1024*1024 }), /5 MB/);
  assert.equal(evidenceUploadMimeMatches("request/token/proof.jpg", { type: "image/jpeg", size: 500 }), true);
  assert.equal(evidenceUploadMimeMatches("request/token/proof.png", { type: "image/jpeg", size: 500 }), false);
});

test("leave UI warns without proof and uploads before success/approval", () => {
  const form = source("src/components/LeaveRequestForm.tsx");
  assert.match(form, /if \(!evidenceFile\)\s*\{\s*setEvidenceModalOpen\(true\)/);
  assert.match(form, /Harus upload bukti izin dari manajemen/);
  assert.match(form, /await repository\.uploadEvidence\(draft, file\);\s*await repository\.finalizeEvidence\(draft\);/);
  assert.match(form, /setPendingEvidenceDraft\(draft\)/);
  assert.doesNotMatch(form, /await repository\.submit\(payload\)/);
});

test("SQL server refuses anonymous legacy submit and keeps screenshot private", () => {
  const sql = source("supabase/migrations/202610120006_v3_14_6_management_leave_evidence.sql");
  assert.match(sql, /'PENDING_EVIDENCE'/);
  assert.match(sql, /'ejadwal-leave-evidence'.*?false, 5242880/s);
  assert.match(sql, /ejadwal_submit_public_leave_request_v4/);
  assert.match(sql, /ejadwal_finalize_leave_evidence_v1/);
  assert.match(sql, /revoke execute on function public\.ejadwal_submit_public_leave_request_v3[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /ejadwal_guard_leave_evidence_approval/);
  assert.match(sql, /current_user_is_staff\(\)/);
});

test("reviewer gets private signed URL, legacy requests remain reviewable", () => {
  const repo = source("src/infrastructure/repositories/supabaseLeaveApprovalRepository.ts");
  const approval = source("src/components/LeaveApprovalAdmin.tsx");
  assert.match(repo, /\.eq\("status", "SUBMITTED"\)/);
  assert.match(repo, /\.createSignedUrl\(path, 120\)/);
  assert.match(approval, /Lihat Bukti Izin Manajemen/);
  assert.match(approval, /Pengajuan lama — tidak ada bukti digital/);
});
