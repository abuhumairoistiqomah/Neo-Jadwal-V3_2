import type { LogIzinItem, Teacher } from "../models";
import type { NewLeaveAbsenceCategory } from "../leaveClassificationV320";
import { TEAM_TEACHING_NO_BADAL } from "../officialDutyBadal";
import {
  resolveSubstituteAvailability,
  type SubstituteConstraint,
} from "../substituteAvailability";

export interface InvalRoomRelocationInput {
  tanggal: string;
  kelas: string;
  jam_ke: number;
  mapel: string;
  ruangan: string;
  alasan: string;
  tipe_insidental: string;
}

export interface InvalTaskResourceInput {
  resource_type: "LINK" | "DRIVE_FILE";
  label?: string | null;
  url: string;
  drive_file_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
}

export interface InvalWriteMetadata {
  /** Mandatory on a new manual Inval; not inferred from free-text reason. */
  absenceCategory?: NewLeaveAbsenceCategory;
  /** One explicit acknowledgement list for each row passed to onAddLogs. */
  constraintOverrideIdsByRow?: string[][];
  /** Resource metadata aligned 1:1 with the expanded persistence rows. */
  taskResourcesByRow?: InvalTaskResourceInput[][];
  /** Aligned per persisted class slot; only explicit changes are forwarded. */
  subjectOverridesByRow?: Array<{ originalSubject: string; subject: string } | null>;
  overrideNote?: string;
}

export interface InvalWriteRow {
  schedule_date: string;
  class_code: string;
  period: number;
  subject: string;
  /** Optional optimistic subject concurrency marker. */
  original_subject?: string;
  absent_teacher_id: string;
  substitute_teacher_id: string | null;
  coverage_decision?: "NO_SUBSTITUTE";
  reason: string;
  task_text: string;
  task_resources: InvalTaskResourceInput[];
  constraint_ids: string[];
}

export interface InvalWriteBundle {
  absence_category?: NewLeaveAbsenceCategory;
  rows: InvalWriteRow[];
  room_incidental: {
    schedule_date: string;
    class_code: string;
    period: number;
    subject: string;
    room_id: string;
    reason: string;
    incidental_type: string;
  } | null;
  override_note: string | null;
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("id-ID");
}

function teacherByName(teachers: Teacher[], name: string): Teacher | undefined {
  const target = normalizeName(name);
  return teachers.find((teacher) => normalizeName(teacher.nama) === target);
}

/**
 * Build the exact payload accepted by the V3.11 atomic write RPC.
 *
 * The explicit override ids come from the user's confirmation in the candidate
 * dropdown. We deliberately do NOT auto-acknowledge a soft constraint here.
 * The database validates the same rules again, so forged/stale browser payloads
 * are rejected server-side as well.
 */
export function buildInvalWriteBundle(input: {
  logs: Omit<LogIzinItem, "id">[];
  roomIncidental?: InvalRoomRelocationInput;
  metadata?: InvalWriteMetadata;
  teachers: Teacher[];
  constraints: SubstituteConstraint[];
}): InvalWriteBundle {
  const overrideLists = input.metadata?.constraintOverrideIdsByRow ?? [];

  const rows: InvalWriteRow[] = input.logs.map((log, index) => {
    const absent = teacherByName(input.teachers, log.guru_izin);
    const noAdditionalSubstitute = log.guru_pengganti === TEAM_TEACHING_NO_BADAL;
    const substitute = noAdditionalSubstitute ? undefined : teacherByName(input.teachers, log.guru_pengganti);

    if (!absent?.id) {
      throw new Error(`Guru izin '${log.guru_izin}' tidak memiliki UUID Supabase.`);
    }
    if (!noAdditionalSubstitute && !substitute?.id) {
      throw new Error(`Guru pengganti '${log.guru_pengganti}' tidak memiliki UUID Supabase.`);
    }

    if (noAdditionalSubstitute && Number(log.jam_ke) === 0) {
      throw new Error("Keputusan team teaching tidak tersedia untuk JP0.");
    }

    const availability = noAdditionalSubstitute ? null : resolveSubstituteAvailability({
      teacherId: substitute!.id,
      date: log.tanggal,
      period: Number(log.jam_ke),
      constraints: input.constraints,
    });

    if (availability?.status === "HARD_BLOCKED") {
      const reasons = availability!.matchingConstraints.map((item) => item.reason).join("; ");
      throw new Error(`Guru '${substitute!.nama}' memiliki pembatasan badal non-override${reasons ? `: ${reasons}` : ""}.`);
    }

    const acknowledged = new Set((overrideLists[index] ?? []).map(String));
    const required = availability?.matchingConstraints
      .filter((constraint) => constraint.overrideAllowed)
      .map((constraint) => constraint.id) ?? [];

    const missing = required.filter((constraintId) => !acknowledged.has(constraintId));
    if (missing.length > 0) {
      const reasons = availability!.matchingConstraints
        .filter((constraint) => missing.includes(constraint.id))
        .map((constraint) => constraint.reason)
        .join("; ");
      throw new Error(
        `Override pembatasan badal untuk '${substitute!.nama}' belum dikonfirmasi${reasons ? `: ${reasons}` : ""}.`,
      );
    }

    const subjectChange = input.metadata?.subjectOverridesByRow?.[index] ?? null;
    if (subjectChange) {
      const original = subjectChange.originalSubject.trim();
      const desired = subjectChange.subject.trim();
      if (!original || !desired || desired.length > 120 || original.length > 120) {
        throw new Error("Mapel awal dan mapel pengganti wajib terisi (maksimum 120 karakter).");
      }
      if (Number(log.jam_ke) === 0) throw new Error("Mapel JP0 Homeroom tidak boleh diganti.");
      if (desired !== String(log.mapel || "").trim()) {
        throw new Error("Mapel badal berubah saat proses penyimpanan. Generate ulang sesi.");
      }
    }

    return {
      schedule_date: log.tanggal,
      class_code: String(log.kelas || "").trim(),
      period: Number(log.jam_ke),
      subject: String(log.mapel || "").trim(),
      ...(subjectChange ? { original_subject: subjectChange.originalSubject.trim() } : {}),
      absent_teacher_id: absent.id,
      substitute_teacher_id: noAdditionalSubstitute ? null : substitute!.id,
      ...(noAdditionalSubstitute ? { coverage_decision: "NO_SUBSTITUTE" as const } : {}),
      reason: String(log.alasan || "").trim(),
      task_text: String(log.tugas || "").trim(),
      task_resources: (input.metadata?.taskResourcesByRow?.[index] ?? []).map((resource) => ({ ...resource })),
      constraint_ids: required,
    };
  });

  const room = input.roomIncidental
    ? {
        schedule_date: input.roomIncidental.tanggal,
        class_code: input.roomIncidental.kelas.trim(),
        period: Number(input.roomIncidental.jam_ke),
        subject: input.roomIncidental.mapel.trim(),
        room_id: input.roomIncidental.ruangan.trim(),
        reason: input.roomIncidental.alasan.trim(),
        incidental_type: input.roomIncidental.tipe_insidental.trim() || "Relokasi Ruangan",
      }
    : null;

  return {
    rows,
    absence_category: input.metadata?.absenceCategory,
    room_incidental: room,
    override_note: input.metadata?.overrideNote?.trim() || null,
  };
}
