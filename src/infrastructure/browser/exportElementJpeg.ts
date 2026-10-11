const COLOR_FUNCTION_RE = /(oklch|oklab|lab|lch)\([^)]*\)/gi;
const UNSUPPORTED_COLOR_RE = /(oklch|oklab|lab|lch|color-mix|color\()\s*/i;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function gammaEncode(value: number): number {
  const v = clamp01(value);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function rgba(r: number, g: number, b: number, alpha = 1): string {
  return `rgba(${Math.round(clamp01(r) * 255)}, ${Math.round(clamp01(g) * 255)}, ${Math.round(clamp01(b) * 255)}, ${clamp01(alpha)})`;
}

function parseAlpha(raw?: string): number {
  if (!raw) return 1;
  const value = raw.trim();
  if (value.endsWith("%")) return clamp01(Number.parseFloat(value) / 100);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clamp01(parsed) : 1;
}

function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [gammaEncode(r), gammaEncode(g), gammaEncode(blue)];
}

function parseLightness(raw: string): number {
  return raw.trim().endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
}

function convertOklch(match: string): string {
  const body = match.slice(match.indexOf("(") + 1, -1).trim();
  const [colorPart, alphaPart] = body.split("/").map((part) => part.trim());
  const parts = colorPart.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return "rgba(226, 232, 240, 1)";
  const L = parseLightness(parts[0]);
  const C = Number.parseFloat(parts[1]);
  const hue = Number.parseFloat(parts[2].replace(/deg$/i, ""));
  if (![L, C, hue].every(Number.isFinite)) return "rgba(226, 232, 240, 1)";
  const radians = hue * Math.PI / 180;
  const [r, g, b] = oklabToSrgb(L, C * Math.cos(radians), C * Math.sin(radians));
  return rgba(r, g, b, parseAlpha(alphaPart));
}

function convertOklab(match: string): string {
  const body = match.slice(match.indexOf("(") + 1, -1).trim();
  const [colorPart, alphaPart] = body.split("/").map((part) => part.trim());
  const parts = colorPart.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return "rgba(226, 232, 240, 1)";
  const L = parseLightness(parts[0]);
  const a = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  if (![L, a, b].every(Number.isFinite)) return "rgba(226, 232, 240, 1)";
  const [r, g, blue] = oklabToSrgb(L, a, b);
  return rgba(r, g, blue, parseAlpha(alphaPart));
}

export function sanitizeCssColorFunctions(value: string, propertyName = ""): string {
  if (!value || !UNSUPPORTED_COLOR_RE.test(value)) return value;
  let converted = value
    .replace(/oklch\([^)]*\)/gi, convertOklch)
    .replace(/oklab\([^)]*\)/gi, convertOklab);
  if (!UNSUPPORTED_COLOR_RE.test(converted)) return converted;

  const property = propertyName.toLocaleLowerCase("en-US");
  if (property.includes("shadow") || property.includes("filter") || property.includes("image")) return "none";
  if (property.includes("color") || property.includes("background") || property.includes("border")) return "rgba(0, 0, 0, 0)";
  return converted
    .replace(COLOR_FUNCTION_RE, "rgba(0, 0, 0, 0)")
    .replace(/color-mix\([^)]*\)/gi, "rgba(0, 0, 0, 0)")
    .replace(/color\([^)]*\)/gi, "rgba(0, 0, 0, 0)");
}

/**
 * Copy only resolved CSS properties. Tailwind v4 publishes its palette through
 * CSS custom properties containing OKLAB/OKLCH values. html2canvas parses the
 * stylesheet/custom-property text even when the visible property is already
 * resolved, so custom properties must never be copied into the export tree.
 */
function copyComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  const targetStyle = (target as HTMLElement | SVGElement).style;
  for (let i = 0; i < computed.length; i += 1) {
    const property = computed.item(i);
    if (!property || property.startsWith("--")) continue;
    const raw = computed.getPropertyValue(property);
    try {
      targetStyle.setProperty(property, sanitizeCssColorFunctions(raw, property), computed.getPropertyPriority(property));
    } catch {
      // Browser-only/read-only properties are not needed for a visual clone.
    }
  }
  target.removeAttribute("class");
}


function measureExpandedExportWidth(source: HTMLElement): number {
  const rootRect = source.getBoundingClientRect();
  let width = Math.max(source.scrollWidth, rootRect.width);
  source.querySelectorAll<HTMLElement>('[data-export-expand-scroll="true"]').forEach((node) => {
    const rect = node.getBoundingClientRect();
    const leftInset = Math.max(0, rect.left - rootRect.left);
    const rightInset = Math.max(0, rootRect.right - rect.right);
    width = Math.max(width, leftInset + Math.max(node.scrollWidth, rect.width) + rightInset);
  });
  return Math.ceil(width);
}

function cloneWithSafeComputedStyles(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const sourceNodes = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll("*"))];

  sourceNodes.forEach((sourceNode, index) => {
    const targetNode = cloneNodes[index];
    if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;

    if ((sourceNode as HTMLElement).dataset?.exportIgnore === "true") {
      targetNode.remove();
      return;
    }

    copyComputedStyles(sourceNode, targetNode);
    targetNode.removeAttribute("class");

    const sourceHtml = sourceNode as HTMLElement;
    const targetHtml = targetNode as HTMLElement;
    if (sourceHtml.dataset?.exportExpandScroll === "true") {
      targetHtml.style.overflow = "visible";
      targetHtml.style.overflowX = "visible";
      targetHtml.style.overflowY = "visible";
      targetHtml.style.width = `${Math.max(sourceHtml.scrollWidth, sourceHtml.getBoundingClientRect().width)}px`;
      targetHtml.style.maxWidth = "none";
    }
  });

  clone.style.margin = "0";
  clone.style.boxShadow = "none";
  clone.style.transform = "none";
  clone.style.width = `${measureExpandedExportWidth(source)}px`;
  clone.style.maxWidth = "none";
  clone.style.backgroundColor = "#ffffff";
  return clone;
}

function applyReadableTimetableExportTweaks(root: HTMLElement): void {
  // Teacher labels are line-clamped in the interactive table so the live UI
  // stays compact. html2canvas can clip glyph baselines when that WebKit
  // clamp is copied into the export tree. Export mode deliberately expands
  // those labels and gives them a slightly roomier line-height.
  root.querySelectorAll<HTMLElement>('[data-export-expand-text="true"]').forEach((node) => {
    node.style.display = "block";
    node.style.overflow = "visible";
    node.style.whiteSpace = "normal";
    node.style.textOverflow = "clip";
    node.style.wordBreak = "break-word";
    node.style.overflowWrap = "anywhere";
    node.style.lineHeight = "1.25";
    node.style.minHeight = "1.25em";
    node.style.removeProperty("-webkit-line-clamp");
    node.style.removeProperty("-webkit-box-orient");
  });

  root.querySelectorAll<HTMLElement>('[data-export-cell="true"]').forEach((cell) => {
    cell.style.height = "auto";
    cell.style.minHeight = "72px";
    cell.style.overflow = "visible";
  });
}

function computeRasterScale(width: number, height: number, preferred = 2.5): number {
  // Keep PNG crisp without creating an enormous canvas on unusually large
  // schedules. 16 megapixels is a comfortable browser-side ceiling.
  const maxPixels = 16_000_000;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const cap = Math.sqrt(maxPixels / (safeWidth * safeHeight));
  return Math.max(1, Math.min(preferred, cap));
}

function createIsolatedExportFrame(width: number): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.position = "fixed";
  frame.style.left = "-100000px";
  frame.style.top = "0";
  frame.style.width = `${Math.max(1, Math.ceil(width))}px`;
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Dokumen export terisolasi tidak dapat dibuat.");
  }
  doc.open();
  doc.write("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
  doc.close();
  doc.documentElement.style.margin = "0";
  doc.documentElement.style.padding = "0";
  doc.documentElement.style.background = "#ffffff";
  doc.body.style.margin = "0";
  doc.body.style.padding = "0";
  doc.body.style.background = "#ffffff";
  // The iframe intentionally receives no application stylesheet. This is the
  // hard boundary that prevents html2canvas from ever parsing Tailwind OKLAB.
  return frame;
}

export async function downloadElementAsJpeg(element: HTMLElement, filename: string): Promise<void> {
  const safeClone = cloneWithSafeComputedStyles(element);
  const width = measureExpandedExportWidth(element);
  const frame = createIsolatedExportFrame(width);

  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Dokumen export tidak tersedia.");
    const clone = doc.importNode(safeClone, true) as HTMLElement;
    applyReadableTimetableExportTweaks(clone);
    doc.body.appendChild(clone);
    frame.style.height = `${Math.max(1, Math.ceil(clone.scrollHeight))}px`;

    if (doc.fonts?.ready) await doc.fonts.ready;
    await new Promise<void>((resolve) => {
      const raf = frame.contentWindow?.requestAnimationFrame?.bind(frame.contentWindow) || requestAnimationFrame;
      raf(() => raf(() => resolve()));
    });

    const html2canvas = (await import("html2canvas")).default;
    const renderWidth = Math.ceil(Math.max(clone.scrollWidth, clone.getBoundingClientRect().width));
    const renderHeight = Math.ceil(Math.max(clone.scrollHeight, clone.getBoundingClientRect().height));
    const canvas = await html2canvas(clone, {
      scale: computeRasterScale(renderWidth, renderHeight, 2.5),
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      width: renderWidth,
      height: renderHeight,
      windowWidth: renderWidth,
      windowHeight: renderHeight,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDocument) => {
        // Defensive final sweep. Even third-party DOM cloning must not re-add
        // Tailwind classes or custom properties containing OKLAB/OKLCH.
        (Array.from(clonedDocument.querySelectorAll("*")) as Array<HTMLElement | SVGElement>).forEach((node) => {
          node.removeAttribute("class");
          const style = node.style;
          for (let i = style.length - 1; i >= 0; i -= 1) {
            const property = style.item(i);
            if (!property) continue;
            if (property.startsWith("--")) {
              style.removeProperty(property);
              continue;
            }
            const value = style.getPropertyValue(property);
            if (UNSUPPORTED_COLOR_RE.test(value)) {
              style.setProperty(property, sanitizeCssColorFunctions(value, property), style.getPropertyPriority(property));
            }
          }
        });
      },
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Canvas JPG tidak dapat dibuat.")), "image/jpeg", 0.95);
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  } finally {
    frame.remove();
  }
}

/**
 * Lossless timetable export. PNG is the preferred schedule image format
 * because small text and table borders stay sharp after download.
 */
export async function downloadElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const safeClone = cloneWithSafeComputedStyles(element);
  const width = measureExpandedExportWidth(element);
  const frame = createIsolatedExportFrame(width);

  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Dokumen export tidak tersedia.");
    const clone = doc.importNode(safeClone, true) as HTMLElement;
    applyReadableTimetableExportTweaks(clone);
    doc.body.appendChild(clone);
    frame.style.height = `${Math.max(1, Math.ceil(clone.scrollHeight))}px`;

    if (doc.fonts?.ready) await doc.fonts.ready;
    await new Promise<void>((resolve) => {
      const raf = frame.contentWindow?.requestAnimationFrame?.bind(frame.contentWindow) || requestAnimationFrame;
      raf(() => raf(() => resolve()));
    });

    const html2canvas = (await import("html2canvas")).default;
    const renderWidth = Math.ceil(Math.max(clone.scrollWidth, clone.getBoundingClientRect().width));
    const renderHeight = Math.ceil(Math.max(clone.scrollHeight, clone.getBoundingClientRect().height));
    const canvas = await html2canvas(clone, {
      scale: computeRasterScale(renderWidth, renderHeight, 2.5),
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      width: renderWidth,
      height: renderHeight,
      windowWidth: renderWidth,
      windowHeight: renderHeight,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDocument) => {
        (Array.from(clonedDocument.querySelectorAll("*")) as Array<HTMLElement | SVGElement>).forEach((node) => {
          node.removeAttribute("class");
          const style = node.style;
          for (let i = style.length - 1; i >= 0; i -= 1) {
            const property = style.item(i);
            if (!property) continue;
            if (property.startsWith("--")) {
              style.removeProperty(property);
              continue;
            }
            const value = style.getPropertyValue(property);
            if (UNSUPPORTED_COLOR_RE.test(value)) {
              style.setProperty(property, sanitizeCssColorFunctions(value, property), style.getPropertyPriority(property));
            }
          }
        });
      },
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Canvas PNG tidak dapat dibuat.")), "image/png");
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  } finally {
    frame.remove();
  }
}

