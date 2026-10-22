import type { EffectiveScheduleItem } from "../schedule/effectiveSchedule";
import type { LogIzinItem } from "../models";
import { parseScheduleClassMode } from "../schedule/classMode";
import { getClassGender } from "../classGender";
import { teachingSessionSignature } from "../schedule/teachingSession";

export interface InvalSessionTargetSlot {
  kelas: string;
  mapel: string;
}

export interface InvalSessionGroup {
  jam_ke: number;
  kelas: string;
  mapel: string;
  recommendationClassLabel: string;
  targetSlots: InvalSessionTargetSlot[];
  isCombinedGroup: boolean;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function uniqueByClass(items: EffectiveScheduleItem[]): EffectiveScheduleItem[] {
  const seen = new Set<string>();
  const result: EffectiveScheduleItem[] = [];
  for (const item of items) {
    const key = normalize(item.kelas);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function recommendationClassFor(classes: string[]): string {
  const genders = new Set(classes.map(getClassGender).filter((value) => value !== "UNKNOWN"));
  if (genders.size > 1) return "MIXED";
  return classes[0] || "";
}

/**
 * Builds operator-facing teaching sessions using the same inference as the
 * legacy timetable: same JP/time + subject + teacher set means one combined
 * teaching session, even when only one (or neither) row says kelasgabung=Ya.
 *
 * Persistence remains one canonical coverage row per real class.
 */
export function groupInvalScheduleItems(items: EffectiveScheduleItem[]): InvalSessionGroup[] {
  const buckets = new Map<string, EffectiveScheduleItem[]>();

  for (const item of items) {
    const key = teachingSessionSignature(item);
    const bucket = buckets.get(key) || [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  const groups: InvalSessionGroup[] = [];
  for (const bucket of buckets.values()) {
    const unique = uniqueByClass(bucket);
    const classes = unique.map((item) => item.kelas).filter(Boolean);
    const subjects = [...new Set(unique.map((item) => String(item.mapel || "").trim()).filter(Boolean))];
    const explicitlyCombined = unique.some((item) => parseScheduleClassMode(item.kelasgabung) === "COMBINED");
    const isCombinedGroup = unique.length > 1 || explicitlyCombined;

    groups.push({
      jam_ke: Number(unique[0]?.jam_ke ?? 0),
      kelas: classes.join(" + "),
      mapel: subjects.join(" + "),
      recommendationClassLabel: recommendationClassFor(classes),
      targetSlots: unique.map((item) => ({ kelas: item.kelas, mapel: item.mapel || "" })),
      isCombinedGroup,
    });
  }

  return groups.sort((a, b) => {
    const byPeriod = a.jam_ke - b.jam_ke;
    if (byPeriod !== 0) return byPeriod;
    return a.kelas.localeCompare(b.kelas, "id-ID", { numeric: true, sensitivity: "base" });
  });
}

export interface InvalSessionRowForPersistence {
  jam_ke: number;
  kelas: string;
  mapel: string;
  selectedPengganti: string;
  /** Explicit per-session subject change, never the master subject. */
  subjectOverride?: string;
  tugas?: string;
  constraintOverrideIds?: string[];
  targetSlots?: InvalSessionTargetSlot[];
}

export function expandInvalSessionRowsForPersistence(args: {
  rows: InvalSessionRowForPersistence[];
  tanggal: string;
  guruIzin: string;
  alasan: string;
}): Array<{
  log: Omit<LogIzinItem, "id">;
  constraintOverrideIds: string[];
  subjectOverride: { originalSubject: string; subject: string } | null;
}> {
  return args.rows.flatMap((row) => {
    const targets = row.targetSlots && row.targetSlots.length > 0
      ? row.targetSlots
      : [{ kelas: row.kelas, mapel: row.mapel }];

    const override = String(row.subjectOverride || "").trim();
    // Preserve each source slot's original subject for optimistic concurrency.
    return targets.map((target) => ({
      subjectOverride: override && override !== String(target.mapel || row.mapel).trim()
        ? { originalSubject: String(target.mapel || row.mapel).trim(), subject: override }
        : null,
      log: {
        tanggal: args.tanggal,
        guru_izin: args.guruIzin,
        alasan: args.alasan,
        jam_ke: Number(row.jam_ke),
        kelas: target.kelas,
        mapel: override || target.mapel || row.mapel,
        guru_pengganti: row.selectedPengganti,
        tugas: row.tugas || "",
      },
      constraintOverrideIds: [...(row.constraintOverrideIds || [])],
    }));
  });
}
