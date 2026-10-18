import type { TeacherWeekRow, TeacherWeeklyMode } from "./teacherWeeklyView";

/**
 * V3.17.3 RC2: one source of truth for the operational text displayed in BOTH
 * desktop timetable cells and mobile timetable cards. A responsive layout must
 * not silently omit a supervisor, reassignment, leave or other dated reason.
 *
 * This is presentation-only: no mutation of the effective schedule or master.
 */
export function getTeacherWeekSlotAnnotations(
  items: ReadonlyArray<Pick<TeacherWeekRow, "weekStatus" | "weekDetail" | "keterangan_khusus">>,
  mode: TeacherWeeklyMode,
): { statusLabels: string[]; operationalDetails: string[]; specialNotes: string[] } {
  const statusLabels: string[] = [];
  const operationalDetails: string[] = [];
  const specialNotes: string[] = [];
  const seenStatuses = new Set<string>();
  const seenNotes = new Set<string>();

  const addUnique = (list: string[], value: string, seen: Set<string>) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase("id-ID");
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    list.push(trimmed);
  };

  for (const item of items) {
    if (mode === "EFFECTIVE") {
      const status = item.weekStatus;
      if (status !== "NORMAL") {
        addUnique(statusLabels,
          status === "KALENDER" ? "KALENDER / KBM BATAL"
            : status === "TUGAS_RESMI" ? "TUGAS SEKOLAH — TIDAK MENGAJAR"
              : status, seenStatuses);
      }
      addUnique(operationalDetails, item.weekDetail || "", seenNotes);
    }
  }

  // The master-only notes remain useful in both views. Avoid duplicate lines
  // when an incidental reason and a special note happen to be identical.
  for (const item of items) {
    addUnique(specialNotes, item.keterangan_khusus || "", seenNotes);
  }

  return { statusLabels, operationalDetails, specialNotes };
}
