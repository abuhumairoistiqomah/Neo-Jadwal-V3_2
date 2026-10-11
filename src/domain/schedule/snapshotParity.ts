import type { ScheduleDataSnapshot } from "../../infrastructure/repositories/scheduleRepository";

export type SnapshotSection = keyof ScheduleDataSnapshot;

export interface SnapshotSectionParity {
  section: SnapshotSection;
  expectedCount: number;
  actualCount: number;
  missing: string[];
  extra: string[];
  ok: boolean;
}

export interface SnapshotParityResult {
  ok: boolean;
  sections: SnapshotSectionParity[];
  differences: string[];
}

function clean(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function teacherFingerprint(row: ScheduleDataSnapshot["teachers"][number]): string {
  return [
    row.nama,
    row.panggilan,
    row.gender,
    row.whatsapp_e164,
    row.mapel_utama,
    row.rumpun,
    row.jenjang,
    row.tugas_tambahan,
    row.keterangan,
    row.wali_kelas,
    row.pendamping_kelas,
    row.is_manajemen ? "1" : "0",
  ].map(clean).join("|");
}

function scheduleFingerprint(row: ScheduleDataSnapshot["schedules"][number]): string {
  return [
    row.kelas, row.hari, row.jam_ke, row.mulai, row.selesai, row.mapel,
    row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6,
    row.kelasgabung, row.ruangan, row.selainguru1_mengawas, row.keterangan_khusus,
  ].map(clean).join("|");
}

function logFingerprint(row: ScheduleDataSnapshot["logs"][number]): string {
  return [
    row.tanggal, row.guru_izin, row.alasan, row.jam_ke, row.kelas, row.mapel,
    row.guru_pengganti, row.tugas,
  ].map(clean).join("|");
}

function incidentalFingerprint(row: ScheduleDataSnapshot["jadwalInsidental"][number]): string {
  return [
    row.tanggal, row.kelas, row.jam_ke, row.mapel,
    row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6,
    row.kelasgabung, row.ruangan, row.keterangan_khusus, row.alasan, row.tipe_insidental,
  ].map(clean).join("|");
}

function roomFingerprint(row: ScheduleDataSnapshot["masterRuangan"][number]): string {
  return [row.id_ruangan, row.nama_ruangan, row.alias, row.kapasitas, row.lokasi, row.jenis, row.status]
    .map(clean).join("|");
}

function calendarFingerprint(row: ScheduleDataSnapshot["kalenderAkademik"][number]): string {
  return [
    row.tanggal_mulai, row.tanggal_selesai, row.nama_kegiatan, row.tipe, row.cakupan,
    row.kelas, row.jp_mulai, row.jp_selesai, row.status,
  ].map(clean).join("|");
}

const fingerprintBySection: {
  [K in SnapshotSection]: (row: ScheduleDataSnapshot[K][number]) => string;
} = {
  teachers: teacherFingerprint,
  schedules: scheduleFingerprint,
  logs: logFingerprint,
  jadwalInsidental: incidentalFingerprint,
  masterRuangan: roomFingerprint,
  kalenderAkademik: calendarFingerprint,
};

function multiset(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  values.forEach((value) => result.set(value, (result.get(value) || 0) + 1));
  return result;
}

function sampleDelta(left: Map<string, number>, right: Map<string, number>, max = 5): string[] {
  const result: string[] = [];
  for (const [key, count] of left) {
    const diff = count - (right.get(key) || 0);
    for (let index = 0; index < diff && result.length < max; index += 1) result.push(key);
    if (result.length >= max) break;
  }
  return result;
}

export function compareScheduleDataSnapshotSections(
  expected: ScheduleDataSnapshot,
  actual: ScheduleDataSnapshot,
  selectedSections: SnapshotSection[],
): SnapshotParityResult {
  const sections = selectedSections.map((section) => {
    const fingerprint = fingerprintBySection[section] as (row: any) => string;
    const expectedRows = expected[section] as any[];
    const actualRows = actual[section] as any[];
    const expectedSet = multiset(expectedRows.map(fingerprint));
    const actualSet = multiset(actualRows.map(fingerprint));
    const missing = sampleDelta(expectedSet, actualSet);
    const extra = sampleDelta(actualSet, expectedSet);
    return {
      section,
      expectedCount: expectedRows.length,
      actualCount: actualRows.length,
      missing,
      extra,
      ok: expectedRows.length === actualRows.length && missing.length === 0 && extra.length === 0,
    } satisfies SnapshotSectionParity;
  });

  const differences = sections.flatMap((section) => {
    if (section.ok) return [];
    const messages = [
      `${section.section}: expected ${section.expectedCount}, actual ${section.actualCount}`,
    ];
    if (section.missing.length) messages.push(`${section.section}: missing sample ${section.missing.join(" || ")}`);
    if (section.extra.length) messages.push(`${section.section}: extra sample ${section.extra.join(" || ")}`);
    return messages;
  });

  return { ok: sections.every((section) => section.ok), sections, differences };
}

export function compareScheduleDataSnapshots(
  expected: ScheduleDataSnapshot,
  actual: ScheduleDataSnapshot,
): SnapshotParityResult {
  return compareScheduleDataSnapshotSections(
    expected,
    actual,
    Object.keys(fingerprintBySection) as SnapshotSection[],
  );
}
