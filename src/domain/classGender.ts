export type SchoolGender = "IKHWAN" | "AKHWAT" | "UNKNOWN";

export function normalizeSchoolGender(value: unknown): SchoolGender {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (["IKHWAN", "I", "L", "LAKILAKI", "MALE", "PRIA"].includes(raw)) return "IKHWAN";
  if (["AKHWAT", "A", "P", "PEREMPUAN", "FEMALE", "WANITA"].includes(raw)) return "AKHWAT";
  return "UNKNOWN";
}

/**
 * Infers the school gender division from the canonical class label.
 * - MQ uses explicit IKHWAN / AKHWAT tokens.
 * - AE / INTER use terminal I / A markers.
 * The terminal-token rule deliberately avoids matching arbitrary letters inside names.
 */
export function getClassGender(className: string | null | undefined): SchoolGender {
  const upper = String(className ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!upper) return "UNKNOWN";

  if (/\bIKHWAN\b/.test(upper)) return "IKHWAN";
  if (/\bAKHWAT\b/.test(upper)) return "AKHWAT";
  if (/\sI$/.test(upper)) return "IKHWAN";
  if (/\sA$/.test(upper)) return "AKHWAT";
  return "UNKNOWN";
}

export type GenderPreference = "MATCH" | "MISMATCH" | "UNKNOWN";

export function getGenderPreference(className: string, teacherGender: unknown): GenderPreference {
  const classGender = getClassGender(className);
  const normalizedTeacher = normalizeSchoolGender(teacherGender);
  if (classGender === "UNKNOWN" || normalizedTeacher === "UNKNOWN") return "UNKNOWN";
  return classGender === normalizedTeacher ? "MATCH" : "MISMATCH";
}

/** Higher is preferred. Gender is a ranking preference, never a hard availability gate. */
export function genderPreferenceRank(value: GenderPreference): number {
  if (value === "MATCH") return 2;
  if (value === "UNKNOWN") return 1;
  return 0;
}
