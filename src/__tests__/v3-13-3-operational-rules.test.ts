import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLeaveReviewWhatsappMessage } from "../domain/whatsappTemplates";

test("pre-approval WhatsApp uses friendly gender-aware language", () => {
  const message = buildLeaveReviewWhatsappMessage({
    teacherName: "NAFSI LATIFAH, S.Pd",
    teacher: { nama: "NAFSI LATIFAH, S.Pd", gender: "AKHWAT", mapel_utama: "", rumpun: "", jenjang: "", tugas_tambahan: "", keterangan: "" },
    requestCode: "IZN-TEST",
    dateLabel: "14/10/2026",
    reason: "Urusan keluarga",
    periodLabel: "JP 1, JP 2",
  });
  assert.match(message, /Assalamu'alaikum warahmatullahi wabarakatuh, Ustadzah NAFSI LATIFAH/);
  assert.match(message, /Afwan, ana ingin mengonfirmasi/);
  assert.match(message, /JP 1, JP 2/);
});

test("V3.13.3 exposes operational editors in admin navigation", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /Aturan Guru Badal/);
  assert.match(app, /Kalender Akademik/);
  assert.match(app, /SubstituteConstraintAdmin/);
  assert.match(app, /AcademicCalendarAdmin/);
});

test("substitute restriction editor supports hard block, DATE rules, and JP0", () => {
  const source = readFileSync("src/components/SubstituteConstraintAdmin.tsx", "utf8");
  assert.match(source, /HARD BLOCK/);
  assert.match(source, /Tanggal Tertentu/);
  assert.match(source, /Semua JP \(0–6\)/);
  assert.match(source, /overrideAllowed/);
});

test("academic calendar editor supports multi-class and full/partial day events", () => {
  const source = readFileSync("src/components/AcademicCalendarAdmin.tsx", "utf8");
  assert.match(source, /Kelas Terdampak/);
  assert.match(source, /Semua kelas/);
  assert.match(source, /Sehari Penuh/);
  assert.match(source, /Batasi JP Tertentu/);
});

test("V3.13.3 migration adds calendar grouping, staff write access, and operational audit", () => {
  const sql = readFileSync("supabase/migrations/202610100034_v3_13_3_operational_rules.sql", "utf8");
  assert.match(sql, /admin_group_code/);
  assert.match(sql, /academic_events_staff_write/);
  assert.match(sql, /current_user_is_staff/);
  assert.match(sql, /audit_operational_rule_change/);
  assert.match(sql, /substitute_constraints/);
  assert.match(sql, /academic_events/);
});

test("approval queue has a WhatsApp shortcut before approve/decline", () => {
  const source = readFileSync("src/components/LeaveApprovalAdmin.tsx", "utf8");
  assert.match(source, /contactBeforeDecision/);
  assert.match(source, /Hubungi Guru/);
  assert.match(source, /buildLeaveReviewWhatsappMessage/);
});
