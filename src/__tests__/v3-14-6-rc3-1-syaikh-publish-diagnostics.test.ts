import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { explainSyaikhPublishError, isSyaikhTeacherConflictRequired } from "../domain/syaikhRotationPublishErrors";

const component = fs.readFileSync(new URL("../components/SyaikhScheduleMassImporter.tsx", import.meta.url), "utf8");

test("RC3.1: conflict from database (not preview) must require explicit confirmation before retry", () => {
  assert.equal(isSyaikhTeacherConflictRequired({ message: "TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED", code: "P0001" }), true);
  assert.equal(isSyaikhTeacherConflictRequired({ message: "ROOM_NOT_FOUND", code: "P0001" }), false);
  assert.match(component, /!initiallyConfirmed && isSyaikhTeacherConflictRequired\(initialError\)/);
  assert.match(component, /window\.confirm\(/);
  assert.match(component, /result = await submit\(true\)/);
  assert.match(component, /result = await submit\(initiallyConfirmed\)/);
});

test("RC3.1: missing Supabase RPC should report required migration", () => {
  const text = explainSyaikhPublishError({ code: "PGRST202", message: "Could not find the function public.ejadwal_publish_syaikh_rotation_v1" }, []);
  assert.match(text, /202610100040_v3_13_5_syaikh_rotation_import.sql/);
});

test("RC3.1: occupied incidental slot error should include friendly class label", () => {
  const classId = "11111111-2222-3333-4444-555555555555";
  const text = explainSyaikhPublishError({ code: "P0001", message: `INCIDENTAL_SLOT_OWNED_BY_OTHER_CHANGE:2026-10-12:${classId}:2` }, [
    { scheduleDate: "2026-10-12", classId, className: "02 INTER 1 I", period: 2 },
  ]);
  assert.match(text, /02 INTER 1 I/);
  assert.match(text, /insidental lain/);
});

test("RC3.1: status and error are also visible next to publish button, not only above preview", () => {
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /0 warning pada preview tidak menjamin/);
  assert.match(component, /Publish berhasil, tetapi refresh tampilan gagal/);
});
