/** Time overrides apply to one class/date/JP and never mutate the weekly master. */
export function timeForInput(value: string | null | undefined): string {
  const input = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(input) ? input.slice(0, 5) : "";
}

export function validateDatedTimeOverride(start: string | null | undefined, end: string | null | undefined): string | null {
  const from = String(start || "").trim();
  const to = String(end || "").trim();
  if (!from && !to) return null; // inherit the master times
  if (!timeForInput(from) || !timeForInput(to)) return "Isi jam mulai dan selesai dengan format HH:mm.";
  if (timeForInput(from) >= timeForInput(to)) return "Jam selesai harus lebih besar dari jam mulai (pada hari yang sama).";
  return null;
}
