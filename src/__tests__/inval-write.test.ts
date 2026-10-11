import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildInvalWriteBundle } from "../domain/inval/invalWrite";
import type { Teacher } from "../domain/models";
import type { SubstituteConstraint } from "../domain/substituteAvailability";

const teachers: Teacher[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    nama: "Guru Izin",
    gender: "IKHWAN",
    mapel_utama: "Math",
    rumpun: "Math",
    jenjang: "SD",
    tugas_tambahan: "",
    keterangan: "",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    nama: "Yusril",
    gender: "IKHWAN",
    mapel_utama: "Science",
    rumpun: "Science",
    jenjang: "SD",
    tugas_tambahan: "",
    keterangan: "",
  },
];

const softConstraint: SubstituteConstraint = {
  id: "33333333-3333-3333-3333-333333333333",
  teacherId: "22222222-2222-2222-2222-222222222222",
  kind: "WEEKLY",
  dayOfWeek: 1,
  periodStart: 5,
  periodEnd: 6,
  reason: "Kuliah",
  overrideAllowed: true,
  isActive: true,
};

const baseLog = {
  tanggal: "2026-10-12",
  guru_izin: "Guru Izin",
  alasan: "Izin",
  jam_ke: 5,
  kelas: "06 INTER 1 I",
  mapel: "Mathematics",
  guru_pengganti: "Yusril",
  tugas: "Kerjakan latihan halaman 12",
};

describe("V3.11 Inval write payload", () => {
  it("requires explicit acknowledgement for a matching soft-ban", () => {
    assert.throws(
      () => buildInvalWriteBundle({
        logs: [baseLog],
        teachers,
        constraints: [softConstraint],
      }),
      /belum dikonfirmasi/i,
    );
  });

  it("preserves explicit soft-ban evidence in the RPC payload", () => {
    const bundle = buildInvalWriteBundle({
      logs: [baseLog],
      teachers,
      constraints: [softConstraint],
      metadata: {
        constraintOverrideIdsByRow: [[softConstraint.id]],
        overrideNote: "Wakasek menyetujui override.",
      },
    });
    assert.deepEqual(bundle.rows[0]?.constraint_ids, [softConstraint.id]);
    assert.equal(bundle.rows[0]?.absent_teacher_id, teachers[0]?.id);
    assert.equal(bundle.rows[0]?.substitute_teacher_id, teachers[1]?.id);
    assert.equal(bundle.override_note, "Wakasek menyetujui override.");
  });

  it("maps optional room relocation without turning it into task data", () => {
    const bundle = buildInvalWriteBundle({
      logs: [{ ...baseLog, jam_ke: 4 }],
      teachers,
      constraints: [],
      roomIncidental: {
        tanggal: "2026-10-12",
        kelas: "06 INTER 1 I",
        jam_ke: 4,
        mapel: "Mathematics",
        ruangan: "LABIPA",
        alasan: "Relokasi",
        tipe_insidental: "Relokasi Ruangan",
      },
    });
    assert.equal(bundle.room_incidental?.room_id, "LABIPA");
    assert.equal(bundle.rows[0]?.task_text, "Kerjakan latihan halaman 12");
  });

  it("rejects a matching hard constraint before reaching the database", () => {
    assert.throws(
      () => buildInvalWriteBundle({
        logs: [baseLog],
        teachers,
        constraints: [{ ...softConstraint, overrideAllowed: false }],
      }),
      /non-override/i,
    );
  });
});

describe("V3.11 database migration contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    resolve(here, "../../supabase/migrations/202610070014_v3_11_inval_write_cutover.sql"),
    "utf8",
  );

  it("exposes atomic create/update/delete RPCs", () => {
    assert.match(sql, /ejadwal_save_inval_bundle/);
    assert.match(sql, /ejadwal_update_inval_assignment/);
    assert.match(sql, /ejadwal_delete_inval_assignment/);
  });

  it("keeps imported legacy coverage immutable", () => {
    assert.match(sql, /LEGACY_COVERAGE_IS_IMMUTABLE/);
    assert.match(sql, /source\s*<>\s*'LEGACY_IMPORT'/);
  });

  it("writes both audit records and constraint override evidence", () => {
    assert.match(sql, /insert into public\.audit_logs/i);
    assert.match(sql, /insert into public\.coverage_constraint_overrides/i);
    assert.match(sql, /SOFT_SUBSTITUTE_CONSTRAINT_ACK_REQUIRED/);
  });
});
