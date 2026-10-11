/** Presentation-only label compaction for dense timetable cells and PNG exports.
 * Canonical database values are never mutated by these helpers.
 */

function tidy(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function compactClassLabel(value: unknown): string {
  return tidy(value)
    .replace(/\bMQ\s+IKHWAN\b/gi, "MQ I")
    .replace(/\bMQ\s+AKHWAT\b/gi, "MQ A");
}

export function compactSubjectLabel(value: unknown): string {
  const raw = tidy(value);
  if (!raw) return "";

  const normalized = raw.toLocaleLowerCase("id-ID");
  if (/^(arabic\s*\/\s*native arabic|native arabic\s*\/\s*arabic)$/i.test(raw)) {
    return "Arabic / Native";
  }
  if (normalized === "physical education" || normalized === "pendidikan jasmani") return "PE";
  if (normalized === "bahasa indonesia") return "B. Indonesia";

  const parts = raw.split("/").map(tidy).filter(Boolean);
  if (parts.length > 1) {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const key = part.toLocaleLowerCase("id-ID");
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(part);
    }
    return deduped.join(" / ");
  }

  return raw;
}

export function compactClassList(values: unknown[]): string {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const label = compactClassLabel(value);
    const key = label.toLocaleLowerCase("id-ID");
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result.join(" + ");
}
