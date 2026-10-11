import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWhatsappE164 } from "../infrastructure/repositories/adminMasterDataRepository";
import { buildTaskRequestWhatsappMessage, teacherHonorific } from "../domain/whatsappTemplates";

test("V3.13 master data normalizes Indonesian WhatsApp safely", () => {
  assert.equal(normalizeWhatsappE164("081234567890"), "+6281234567890");
  assert.equal(normalizeWhatsappE164("6281234567890"), "+6281234567890");
  assert.equal(normalizeWhatsappE164("+6281234567890"), "+6281234567890");
});

test("friendly WhatsApp salutation follows teacher gender", () => {
  assert.equal(teacherHonorific({ nama: "A", gender: "IKHWAN", mapel_utama: "", rumpun: "", jenjang: "", tugas_tambahan: "", keterangan: "" }), "Ustadz");
  assert.equal(teacherHonorific({ nama: "B", gender: "AKHWAT", mapel_utama: "", rumpun: "", jenjang: "", tugas_tambahan: "", keterangan: "" }), "Ustadzah");
  const msg = buildTaskRequestWhatsappMessage({ recipientName: "NAFSI", recipientTeacher: { nama: "NAFSI", gender: "AKHWAT", mapel_utama: "", rumpun: "", jenjang: "", tugas_tambahan: "", keterangan: "" }, senderName: "Guru Badal", dateLabel: "09/10/2026", period: 1, subject: "Math", className: "05 MQ" });
  assert.match(msg, /Assalamu'alaikum warahmatullahi wabarakatuh, Ustadzah NAFSI/);
  assert.match(msg, /Afwan, ana ingin/);
});

test("Admin Master Data UI covers teachers classes and rooms", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const page = readFileSync("src/components/AdminMasterData.tsx", "utf8");
  assert.match(app, /master-data/);
  assert.match(page, /Master Data/);
  assert.match(page, /Guru/);
  assert.match(page, /Kelas/);
  assert.match(page, /Ruangan/);
  assert.match(page, /role ADMIN/);
});

test("V3.13 migration audits all three master tables", () => {
  const sql = readFileSync("supabase/migrations/202610090028_v3_13_admin_master_data.sql", "utf8");
  assert.match(sql, /public\.teachers/);
  assert.match(sql, /public\.classes/);
  assert.match(sql, /public\.rooms/);
  assert.match(sql, /audit_logs/);
});
