import type { InvalTaskResourceInput } from "./inval/invalWrite";

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAILING_PUNCTUATION = /[.,;)}\]]+$/;

export function normalizeTaskUrl(raw: string): string {
  const trimmed = String(raw || "").trim().replace(TRAILING_PUNCTUATION, "");
  if (!trimmed) return "";
  return /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
}

export function extractTaskUrls(text: string | undefined): string[] {
  const matches = String(text || "").match(URL_PATTERN) || [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of matches) {
    const normalized = normalizeTaskUrl(match);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls;
}

export function removeTaskUrlFromText(text: string | undefined, targetUrl: string): string {
  const target = normalizeTaskUrl(targetUrl);
  if (!target) return String(text || "");
  return String(text || "")
    .replace(URL_PATTERN, (match) => normalizeTaskUrl(match) === target ? "" : match)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function defaultLinkLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname ? `Tautan ${hostname}` : "Tautan materi";
  } catch {
    return "Tautan materi";
  }
}

/**
 * Keep uploaded Drive files as explicit attachments, while every URL typed or
 * pasted in the task text becomes a first-class LINK resource. A Drive URL
 * produced by the uploader is never duplicated as LINK.
 */
export function syncTaskResourcesWithText(
  text: string | undefined,
  current: InvalTaskResourceInput[],
): InvalTaskResourceInput[] {
  const driveResources = current
    .filter((resource) => resource.resource_type === "DRIVE_FILE")
    .map((resource) => ({ ...resource, url: normalizeTaskUrl(resource.url) || resource.url }));
  const driveUrls = new Set(driveResources.map((resource) => normalizeTaskUrl(resource.url)).filter(Boolean));
  const existingLinks = new Map(
    current
      .filter((resource) => resource.resource_type === "LINK")
      .map((resource) => [normalizeTaskUrl(resource.url), resource] as const)
      .filter(([url]) => Boolean(url)),
  );

  const linkResources = extractTaskUrls(text)
    .filter((url) => !driveUrls.has(url))
    .map((url) => {
      const previous = existingLinks.get(url);
      return {
        resource_type: "LINK" as const,
        label: previous?.label || defaultLinkLabel(url),
        url,
        drive_file_id: null,
        file_name: null,
        mime_type: null,
      };
    });

  return [...driveResources, ...linkResources];
}
