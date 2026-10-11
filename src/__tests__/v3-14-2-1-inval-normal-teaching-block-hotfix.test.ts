import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("root admin runtime loads substitute constraints with Supabase snapshot", () => {
  const app = read("src/App.tsx");
  assert.match(app, /const \[substituteConstraints, setSubstituteConstraints\] = useState<SubstituteConstraint\[]>\(\[\]\)/);
  assert.match(app, /new SupabaseSubstituteConstraintRepository\(\)\.listActiveConstraints\(\)/);
  assert.match(app, /setSubstituteConstraints\(constraints\)/);
});

test("main Input Inval receives the active substitute constraints", () => {
  const app = read("src/App.tsx");
  assert.match(app, /<InputGuruPengganti[\s\S]*substituteConstraints=\{substituteConstraints\}[\s\S]*onAddLogs=\{handleAddLogs\}/);
});

test("constraint editor refreshes the root cache after save or activation changes", () => {
  const admin = read("src/components/SubstituteConstraintAdmin.tsx");
  assert.match(admin, /onChanged\?: \(\) => void \| Promise<void>/);
  assert.ok((admin.match(/await onChanged\?\.\(\)/g) || []).length >= 2);
});

test("normal teaching block turns actual duty into Izin but does not relabel FREE periods", () => {
  const input = read("src/components/InputGuruPengganti.tsx");
  assert.match(input, /normalTeachingBlock\.blocked && \(status === "mengajar" \|\| status === "mendamping"\)/);
  assert.match(input, /statusLabel = `× Izin\$\{classText \? ` \(\$\{classText\}\)` : ""\}`/);
});

test("WhatsApp broadcast recombines canonical rows from one combined substitute session", async () => {
  const { groupSubstituteLogsForBroadcast } = await import("../domain/inval/broadcastGrouping");
  const sessions = groupSubstituteLogsForBroadcast([
    {
      id: "akmal-jp2",
      tanggal: "2026-10-14",
      guru_izin: "AKMAL, Lc.",
      alasan: "Outing Class",
      jam_ke: 2,
      kelas: "09 AE 3 A",
      mapel: "Fiqh",
      guru_pengganti: "KHAERULANA",
    },
    {
      id: "akmal-jp4-mq",
      tanggal: "2026-10-14",
      guru_izin: "AKMAL, Lc.",
      alasan: "Outing Class",
      jam_ke: 4,
      kelas: "08 MQ AKHWAT",
      mapel: "Arabic",
      guru_pengganti: "NASYWAA PUTRI ARDYA",
    },
    {
      id: "akmal-jp4-ae",
      tanggal: "2026-10-14",
      guru_izin: "AKMAL, Lc.",
      alasan: "Outing Class",
      jam_ke: 4,
      kelas: "08 AE 3 A",
      mapel: "Arabic",
      guru_pengganti: "NASYWAA PUTRI ARDYA",
    },
  ]);

  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[1].kelasList, ["08 MQ AKHWAT", "08 AE 3 A"]);
  assert.equal(sessions[1].jam_ke, 4);
  assert.equal(sessions[1].guru_pengganti, "NASYWAA PUTRI ARDYA");
});

test("WhatsApp broadcast does not merge same-JP rows with different subject or substitute", async () => {
  const { groupSubstituteLogsForBroadcast } = await import("../domain/inval/broadcastGrouping");
  const sessions = groupSubstituteLogsForBroadcast([
    {
      id: "a",
      tanggal: "2026-10-14",
      guru_izin: "Guru A",
      alasan: "Kegiatan",
      jam_ke: 4,
      kelas: "08 A",
      mapel: "Arabic",
      guru_pengganti: "Guru B",
    },
    {
      id: "b",
      tanggal: "2026-10-14",
      guru_izin: "Guru A",
      alasan: "Kegiatan",
      jam_ke: 4,
      kelas: "08 B",
      mapel: "Fiqh",
      guru_pengganti: "Guru B",
    },
    {
      id: "c",
      tanggal: "2026-10-14",
      guru_izin: "Guru A",
      alasan: "Kegiatan",
      jam_ke: 4,
      kelas: "08 C",
      mapel: "Arabic",
      guru_pengganti: "Guru C",
    },
  ]);

  assert.equal(sessions.length, 3);
});
