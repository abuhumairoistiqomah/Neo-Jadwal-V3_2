import type { LogIzinItem, Teacher } from "../models";
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
  /** One explicit acknowledgement list for each row passed to onAddLogs. */
  constraintOverrideIdsByRow?: string[][];
  /** Resource metadata aligned 1:1 with the expanded persistence rows. */
  taskResourcesByRow?: InvalTaskResourceInput[][];
  overrideNote?: string;
}

export interface InvalWriteRow {
  schedule_date: string;
  class_code: string;
  period: number;
  subject: string;
  absent_teacher_id: string;
  substitute_teacher_id: string;
  reason: string;
  task_text: string;
  task_resources: InvalTaskResourceInput[];
  constraint_ids: string[];
}

export interface InvalWriteBundle {
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
    const substitute = teacherByName(input.teachers, log.guru_pengganti);

    if (!absent?.id) {
      throw new Error(`Guru izin '${log.guru_izin}' tidak memiliki UUID Supabase.`);
    }
    if (!substitute?.id) {
      throw new Error(`Guru pengganti '${log.guru_pengganti}' tidak memiliki UUID Supabase.`);
    }

    const availability = resolveSubstituteAvailability({
      teacherId: substitute.id,
      date: log.tanggal,
      period: Number(log.jam_ke),
      constraints: input.constraints,
    });

    if (availability.status === "HARD_BLOCKED") {
      const reasons = availability.matchingConstraints.map((item) => item.reason).join("; ");
      throw new Error(`Guru '${substitute.nama}' memiliki pembatasan badal non-override${reasons ? `: ${reasons}` : ""}.`);
    }

    const acknowledged = new Set((overrideLists[index] ?? []).map(String));
    const required = availability.matchingConstraints
      .filter((constraint) => constraint.overrideAllowed)
      .map((constraint) => constraint.id);

    const missing = required.filter((constraintId) => !acknowledged.has(constraintId));
    if (missing.length > 0) {
      const reasons = availability.matchingConstraints
        .filter((constraint) => missing.includes(constraint.id))
        .map((constraint) => constraint.reason)
        .join("; ");
      throw new Error(
        `Override pembatasan badal untuk '${substitute.nama}' belum dikonfirmasi${reasons ? `: ${reasons}` : ""}.`,
      );
    }

    return {
      schedule_date: log.tanggal,
      class_code: String(log.kelas || "").trim(),
      period: Number(log.jam_ke),
      subject: String(log.mapel || "").trim(),
      absent_teacher_id: absent.id,
      substitute_teacher_id: substitute.id,
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
    room_incidental: room,
    override_note: input.metadata?.overrideNote?.trim() || null,
  };
}
