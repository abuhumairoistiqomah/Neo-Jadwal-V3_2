/** Class identity and combined-class helpers. */

export function isCombinedClassValue(value: any): boolean {
  if (value === undefined || value === null) return false;
  const str = String(value).trim().toLowerCase();
  return str === "iya" || str === "ya" || str === "yes" || str === "true" || str === "1";
}



// Shared helper previously duplicated in Dashboard, JadwalKelas, and JadwalLengkap.
export const isGrade1Or2 = (className: string): boolean => {
  if (!className) return false;
  const name = className.trim().toLowerCase();
  return /^(0?1|0?2)\b|^(0?1|0?2)[a-z]/i.test(name) || /class\s*(0?1|0?2)\b/i.test(name) || /grade\s*(0?1|0?2)\b/i.test(name) || /primary\s*(0?1|0?2)\b/i.test(name);
};

export function isClassMatch(classField: string | null | undefined, targetClass: string | null | undefined): boolean {
  if (!classField || !targetClass) return false;

  // Clean prefixes like "Wali Kelas", "Pendamping Kelas", "Wali", "Pendamping", "Kelas"
  const cleanField = String(classField)
    .replace(/\b(wali\s+kelas|pendamping\s+kelas|wali|pendamping|kelas)\b/gi, "")
    .trim();
  const cleanTarget = String(targetClass)
    .replace(/\b(wali\s+kelas|pendamping\s+kelas|wali|pendamping|kelas)\b/gi, "")
    .trim();

  if (!cleanField || !cleanTarget) return false;

  // Split by common delimiters: comma, semicolon, slash, pipe, ampersand, 'and', newline
  const splitRegex = /[;,/|\n&]+|\band\b/i;

  const fieldParts = cleanField.split(splitRegex).map(p => p.trim()).filter(Boolean);
  const targetParts = cleanTarget.split(splitRegex).map(p => p.trim()).filter(Boolean);

  const normalizeToken = (tok: string) => {
    let t = tok.toLowerCase().trim();
    // Normalize "01 MQ" -> "1 mq", "MQ 1" -> "1 mq", "01" -> "1"
    t = t.replace(/\b0+(\d+)\b/g, "$1"); // remove leading zero
    // If format is "mq 1" or "mq 01", convert to "1 mq"
    t = t.replace(/^mq\s*(\d+)$/i, "$1 mq");
    return t;
  };

  const normFieldParts = fieldParts.map(normalizeToken);
  const normTargetParts = targetParts.map(normalizeToken);

  // Check if any normalized token matches
  for (const f of normFieldParts) {
    for (const t of normTargetParts) {
      if (f === t) return true;
      // Handle generic "mq" (e.g. Wali Kelas MQ matching "1 mq", "2 mq", "mq 1", "3 mq", etc.)
      if ((f === "mq" || f === "tahfidz mq") && (t.includes("mq") || t.endsWith("mq"))) return true;
      if ((t === "mq" || t === "tahfidz mq") && (f.includes("mq") || f.endsWith("mq"))) return true;
    }
  }

  // Fallback: exact or case-insensitive equality on normalized strings
  const fLower = cleanField.toLowerCase().replace(/\s+/g, " ");
  const tLower = cleanTarget.toLowerCase().replace(/\s+/g, " ");
  if (fLower === tLower) return true;

  return false;
}

