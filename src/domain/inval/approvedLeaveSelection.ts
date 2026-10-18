import { getClassGender } from "../classGender";
import type { LogIzinItem } from "../models";
import type { WaitingBadalSession, WaitingCoverageRow } from "../leaveApproval";

const norm = (value: unknown): string => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

/** A WAITING session is authoritative: never reconstruct its classes from today's master. */
export function buildApprovedLeaveOperatorRows(session: WaitingBadalSession) {
  const classes = [...new Set(session.classCodes.map((cls) => cls.trim()).filter(Boolean))];
  if (!session.leaveRequestId || !session.scheduleDate || session.coverageSlotIds.length !== classes.length || !classes.length) {
    throw new Error("Sesi Waiting List tidak lengkap. Refresh Persetujuan Izin sebelum memilih badal.");
  }
  const genders = new Set(classes.map(getClassGender).filter((gender) => gender !== "UNKNOWN"));
  return [{
    jam_ke: session.period,
    kelas: classes.join(" + "),
    mapel: session.subject,
    recommendationClassLabel: genders.size > 1 ? "MIXED" : classes[0],
    targetSlots: classes.map((kelas) => ({ kelas, mapel: session.subject })),
    isCombinedGroup: classes.length > 1,
    selectedPengganti: "",
    tugas: session.taskText || "",
    taskResources: session.taskUrls.map((url) => ({resource_type: "LINK" as const, url, label: "Lampiran tugas guru izin"})),
    constraintOverrideIds: [] as string[],
  }];
}

/** Require an exact one-to-one match of still-WAITING, already-approved leave coverage rows. */
export function matchApprovedWaitingAssignments(
  session: WaitingBadalSession,
  freshWaitingRows: WaitingCoverageRow[],
  proposedLogs: Omit<LogIzinItem, "id">[],
): Array<{ coverageSlotId: string; substituteName: string; inputIndex: number }> {
  if (!session.leaveRequestId || !session.coverageSlotIds.length) {
    throw new Error("Tidak ada permohonan izin yang disetujui untuk penugasan ini.");
  }
  if (session.coverageSlotIds.length !== proposedLogs.length) {
    throw new Error(`Jumlah kelas tidak cocok: dibutuhkan ${session.coverageSlotIds.length}, dipilih ${proposedLogs.length}.`);
  }
  const expectedIds = new Set(session.coverageSlotIds);
  if (expectedIds.size !== proposedLogs.length) throw new Error("ID coverage Waiting List terduplikasi.");
  const current = freshWaitingRows.filter((row) => expectedIds.has(row.id));
  if (current.length !== expectedIds.size) {
    throw new Error("Sesi ini sudah berubah atau sebagian badalnya telah diproses. Refresh Waiting List.");
  }
  const pending = new Map<string, WaitingCoverageRow>();
  for (const row of current) {
    if (row.status !== "WAITING" || row.source !== "LEAVE_WORKFLOW"
      || row.leaveRequestId !== session.leaveRequestId || row.scheduleDate !== session.scheduleDate
      || row.period !== session.period || row.absentTeacherId !== session.absentTeacherId
      || norm(row.subject) !== norm(session.subject)) {
      throw new Error("Identitas baris izin berubah. Refresh Waiting List sebelum menyimpan.");
    }
    const key = norm(row.classCode);
    if (!key || pending.has(key)) throw new Error("Kelas Waiting List duplikat atau kosong.");
    pending.set(key, row);
  }
  if (pending.size !== session.classCodes.length || session.classCodes.some((cls) => !pending.has(norm(cls)))) {
    throw new Error("Kelas pada Waiting List sudah berubah.");
  }
  const matched: Array<{ coverageSlotId: string; substituteName: string; inputIndex: number }> = [];
  for (let index = 0; index < proposedLogs.length; index++) {
    const log = proposedLogs[index];
    const row = pending.get(norm(log.kelas));
    if (!row || norm(log.guru_izin) !== norm(session.absentTeacherName)
      || log.tanggal !== session.scheduleDate || Number(log.jam_ke) !== session.period
      || norm(log.mapel) !== norm(row.subject) || norm(log.alasan) !== norm(session.reason || "Izin")) {
      throw new Error("Hasil pemilih badal tidak sesuai sesi izin yang disetujui.");
    }
    if (!String(log.guru_pengganti || "").trim() || norm(log.guru_pengganti) === norm(log.guru_izin)) {
      throw new Error("Guru badal wajib dipilih dan berbeda dari guru yang izin.");
    }
    pending.delete(norm(log.kelas));
    matched.push({coverageSlotId: row.id, substituteName: log.guru_pengganti, inputIndex: index});
  }
  if (pending.size > 0) throw new Error("Masih ada kelas Waiting List yang belum dipilihkan badal.");
  return matched;
}
