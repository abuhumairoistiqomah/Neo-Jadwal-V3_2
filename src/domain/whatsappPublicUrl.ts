/** Public address for WhatsApp broadcasts. Never share localhost or preview URLs. */
export const CANONICAL_PUBLIC_SCHEDULE_URL = "https://neojadwalv3.vercel.app/";

export function getPublicScheduleUrl(origin?: string): string {
  const currentOrigin = String(origin || (typeof window !== "undefined" ? window.location.origin : "")).trim();
  try {
    const parsed = new URL(currentOrigin);
    // Canonical deployment can follow its actual origin; localhost / preview must not leak.
    if (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "neojadwalv3.vercel.app") {
      return `${parsed.origin}/`;
    }
  } catch { /* use canonical address */ }
  return CANONICAL_PUBLIC_SCHEDULE_URL;
}
