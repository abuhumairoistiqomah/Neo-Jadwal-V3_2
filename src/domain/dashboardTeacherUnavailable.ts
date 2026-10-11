import type { LogIzinItem } from "./models";
import type { SubstituteConstraint } from "./substituteAvailability";
import { resolveNormalTeachingBlock } from "./substituteAvailability";

/** A school assignment blocking normal teaching is separate from a cancelled class. */
export function getTeacherUnavailableStatus(input: {
  teacherId?: string | null;
  teacherName: string;
  date: string;
  period: number;
  constraints: SubstituteConstraint[];
  logs: LogIzinItem[];
}): { unavailable: boolean; cause: "ASSIGNMENT" | "LEAVE" | null } {
  if (input.teacherId && resolveNormalTeachingBlock({
    teacherId: input.teacherId,
    date: input.date,
    period: input.period,
    constraints: input.constraints,
  }).blocked) return { unavailable: true, cause: "ASSIGNMENT" };
  const name = input.teacherName.trim().toLocaleLowerCase("id-ID");
  if (name && input.logs.some((log) =>
    log.tanggal === input.date
    && Number(log.jam_ke) === input.period
    && String(log.guru_izin || "").trim().toLocaleLowerCase("id-ID") === name
  )) return { unavailable: true, cause: "LEAVE" };
  return { unavailable: false, cause: null };
}
