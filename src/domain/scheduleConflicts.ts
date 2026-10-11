import type { JadwalInsidentalItem, KalenderAkademikItem, ScheduleItem } from "./models";
import { normalizeImportKey } from "./scheduleImport";
import { buildEffectiveScheduleForDate } from "./schedule/effectiveSchedule";
import { parseScheduleClassMode } from "./schedule/classMode";

export type ScheduleConflictSeverity = "BLOCKER" | "WARNING";
export type ScheduleConflictKind = "CLASS" | "TEACHER" | "ROOM" | "INCIDENTAL";

export interface ScheduleConflict {
  id: string;
  severity: ScheduleConflictSeverity;
  kind: ScheduleConflictKind;
  title: string;
  detail: string;
  dayOrDate: string;
  period: number;
  classes: string[];
  teachers: string[];
  room?: string;
}

function teacherNames(row: Pick<ScheduleItem, "guru1" | "guru2" | "guru3" | "guru4" | "guru5" | "guru6"> | Pick<JadwalInsidentalItem, "guru1" | "guru2" | "guru3" | "guru4" | "guru5" | "guru6">): string[] {
  const values = [row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeImportKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function teacherKey(row: ScheduleItem | JadwalInsidentalItem): string {
  return teacherNames(row).map(normalizeImportKey).sort().join("+");
}

function sessionSignature(row: ScheduleItem): string {
  return [
    normalizeImportKey(row.hari),
    Number(row.jam_ke),
    normalizeImportKey(row.mapel),
    teacherKey(row),
  ].join("|");
}

function incidentalSignature(row: JadwalInsidentalItem): string {
  return [
    row.tanggal,
    Number(row.jam_ke),
    normalizeImportKey(row.mapel),
    teacherKey(row),
  ].join("|");
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeImportKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function detectScheduleConflicts(
  schedules: ScheduleItem[],
  incidentals: JadwalInsidentalItem[] = [],
  kalenderAkademik: KalenderAkademikItem[] = [],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const activeMaster = schedules.filter((row) => row && row.id && row.kelas);
  // Rotation rows are intentionally non-concurrent at the weekly-master level.
  // Only concrete dated occurrences (incidentals) can be evaluated as actual
  // clashes, so keep ALTERNATING rows out of static master conflict buckets.
  const staticMaster = activeMaster.filter((row) => parseScheduleClassMode(row.kelasgabung) !== "ALTERNATING");

  // Collapse inferred combined rows before testing teacher/room collisions.
  const sessions = new Map<string, ScheduleItem[]>();
  staticMaster.forEach((row) => {
    const key = sessionSignature(row);
    const current = sessions.get(key) || [];
    current.push(row);
    sessions.set(key, current);
  });

  // One class cannot have two genuinely different sessions on the same master slot.
  const classSlots = new Map<string, Map<string, ScheduleItem[]>>();
  staticMaster.forEach((row) => {
    const slot = `${normalizeImportKey(row.kelas)}|${normalizeImportKey(row.hari)}|${Number(row.jam_ke)}`;
    const bySignature = classSlots.get(slot) || new Map<string, ScheduleItem[]>();
    const sig = sessionSignature(row);
    bySignature.set(sig, [...(bySignature.get(sig) || []), row]);
    classSlots.set(slot, bySignature);
  });
  classSlots.forEach((bySignature) => {
    if (bySignature.size <= 1) return;
    const rows = [...bySignature.values()].flat();
    const first = rows[0];
    conflicts.push({
      id: `class:${normalizeImportKey(first.kelas)}:${normalizeImportKey(first.hari)}:${first.jam_ke}`,
      severity: "BLOCKER",
      kind: "CLASS",
      title: `Kelas ${first.kelas} memiliki lebih dari satu sesi`,
      detail: unique(rows.map((row) => row.mapel)).join(" • "),
      dayOrDate: first.hari,
      period: Number(first.jam_ke),
      classes: unique(rows.map((row) => row.kelas)),
      teachers: unique(rows.flatMap(teacherNames)),
    });
  });

  const teacherSlots = new Map<string, Array<{ signature: string; rows: ScheduleItem[] }>>();
  sessions.forEach((rows, signature) => {
    const first = rows[0];
    teacherNames(first).forEach((teacher) => {
      const key = `${normalizeImportKey(teacher)}|${normalizeImportKey(first.hari)}|${Number(first.jam_ke)}`;
      const existing = teacherSlots.get(key) || [];
      existing.push({ signature, rows });
      teacherSlots.set(key, existing);
    });
  });
  teacherSlots.forEach((groups, key) => {
    const uniqueGroups = new Map(groups.map((group) => [group.signature, group]));
    if (uniqueGroups.size <= 1) return;
    const rows = [...uniqueGroups.values()].flatMap((group) => group.rows);
    const [teacherKeyPart] = key.split("|");
    const teacher = teacherNames(rows[0]).find((name) => normalizeImportKey(name) === teacherKeyPart)
      || rows.flatMap(teacherNames).find((name) => normalizeImportKey(name) === teacherKeyPart)
      || teacherKeyPart;
    conflicts.push({
      id: `teacher:${key}`,
      severity: "WARNING",
      kind: "TEACHER",
      title: `Potensi bentrok guru: ${teacher}`,
      detail: unique(rows.map((row) => `${row.kelas} • ${row.mapel}`)).join(" | "),
      dayOrDate: rows[0].hari,
      period: Number(rows[0].jam_ke),
      classes: unique(rows.map((row) => row.kelas)),
      teachers: [teacher],
    });
  });

  const roomSlots = new Map<string, Array<{ signature: string; rows: ScheduleItem[] }>>();
  sessions.forEach((rows, signature) => {
    const first = rows[0];
    const room = String(first.ruangan || "").trim();
    if (!room) return;
    const key = `${normalizeImportKey(room)}|${normalizeImportKey(first.hari)}|${Number(first.jam_ke)}`;
    const existing = roomSlots.get(key) || [];
    existing.push({ signature, rows });
    roomSlots.set(key, existing);
  });
  roomSlots.forEach((groups, key) => {
    const uniqueGroups = new Map(groups.map((group) => [group.signature, group]));
    if (uniqueGroups.size <= 1) return;
    const rows = [...uniqueGroups.values()].flatMap((group) => group.rows);
    const room = String(rows.find((row) => row.ruangan)?.ruangan || key.split("|")[0]);
    conflicts.push({
      id: `room:${key}`,
      severity: "BLOCKER",
      kind: "ROOM",
      title: `Ruangan ${room} dipakai lebih dari satu sesi`,
      detail: unique(rows.map((row) => `${row.kelas} • ${row.mapel}`)).join(" | "),
      dayOrDate: rows[0].hari,
      period: Number(rows[0].jam_ke),
      classes: unique(rows.map((row) => row.kelas)),
      teachers: unique(rows.flatMap(teacherNames)),
      room,
    });
  });

  // Date-specific conflicts are scanned from the effective schedule, so an
  // incidental that moves a teacher away from their master slot is not falsely
  // reported as a clash. Academic Calendar suppression is also respected.
  const incidentalDates = [...new Set(incidentals.map((row) => row.tanggal).filter(Boolean))].sort();
  incidentalDates.forEach((date) => {
    const effectiveRows = buildEffectiveScheduleForDate({
      date,
      schedules: activeMaster,
      jadwalInsidental: incidentals,
      kalenderAkademik,
    }).filter((row) => row.isActive && !(row.source === "MASTER" && parseScheduleClassMode(row.kelasgabung) === "ALTERNATING"));

    const dateSessions = new Map<string, typeof effectiveRows>();
    effectiveRows.forEach((row) => {
      // A shared dated session must also share its venue. Same teacher/subject
      // in different rooms is still a real conflict, not a combined class.
      const key = `${sessionSignature(row)}|${normalizeImportKey(row.ruangan)}`;
      const current = dateSessions.get(key) || [];
      current.push(row);
      dateSessions.set(key, current);
    });

    const teacherBuckets = new Map<string, Array<{ signature: string; rows: typeof effectiveRows }>>();
    const roomBuckets = new Map<string, Array<{ signature: string; rows: typeof effectiveRows }>>();

    dateSessions.forEach((rows, signature) => {
      const first = rows[0];
      teacherNames(first).forEach((teacher) => {
        const key = `${normalizeImportKey(teacher)}|${Number(first.jam_ke)}`;
        const bucket = teacherBuckets.get(key) || [];
        bucket.push({ signature, rows });
        teacherBuckets.set(key, bucket);
      });
      const room = String(first.ruangan || "").trim();
      if (room) {
        const key = `${normalizeImportKey(room)}|${Number(first.jam_ke)}`;
        const bucket = roomBuckets.get(key) || [];
        bucket.push({ signature, rows });
        roomBuckets.set(key, bucket);
      }
    });

    teacherBuckets.forEach((groups, key) => {
      const uniqueGroups = new Map(groups.map((group) => [group.signature, group]));
      if (uniqueGroups.size <= 1) return;
      const rows = [...uniqueGroups.values()].flatMap((group) => group.rows);
      if (!rows.some((row) => row.source !== "MASTER")) return;
      const teacherKeyPart = key.split("|")[0];
      const teacher = rows.flatMap(teacherNames).find((name) => normalizeImportKey(name) === teacherKeyPart) || teacherKeyPart;
      conflicts.push({
        id: `inc-teacher:${date}:${key}`,
        severity: "WARNING",
        kind: "INCIDENTAL",
        title: `Insidental berpotensi membenturkan ${teacher}`,
        detail: unique(rows.map((row) => `${row.kelas} • ${row.mapel}`)).join(" | "),
        dayOrDate: date,
        period: Number(rows[0].jam_ke),
        classes: unique(rows.map((row) => row.kelas)),
        teachers: [teacher],
      });
    });

    roomBuckets.forEach((groups, key) => {
      const uniqueGroups = new Map(groups.map((group) => [group.signature, group]));
      if (uniqueGroups.size <= 1) return;
      const rows = [...uniqueGroups.values()].flatMap((group) => group.rows);
      if (!rows.some((row) => row.source !== "MASTER")) return;
      const room = String(rows.find((row) => row.ruangan)?.ruangan || key.split("|")[0]);
      conflicts.push({
        id: `inc-room:${date}:${key}`,
        severity: "BLOCKER",
        kind: "INCIDENTAL",
        title: `Insidental membenturkan ruangan ${room}`,
        detail: unique(rows.map((row) => `${row.kelas} • ${row.mapel}`)).join(" | "),
        dayOrDate: date,
        period: Number(rows[0].jam_ke),
        classes: unique(rows.map((row) => row.kelas)),
        teachers: unique(rows.flatMap(teacherNames)),
        room,
      });
    });
  });

  return conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "BLOCKER" ? -1 : 1;
    return `${a.dayOrDate}|${a.period}|${a.title}`.localeCompare(`${b.dayOrDate}|${b.period}|${b.title}`, "id-ID", { numeric: true });
  });
}
