/** V3.18 RC2: minimal scroll geometry and synchronization; no React update on scroll. */
export function getHorizontalScrollMetrics(viewportWidth: number, contentWidth: number) {
  const width = Math.max(0, viewportWidth);
  const content = Math.max(0, contentWidth);
  return { viewportWidth: width, contentWidth: content, hasOverflow: content > width + 1 };
}

export function getDraggedScrollLeft(startScrollLeft: number, startPointerX: number, currentPointerX: number) {
  return startScrollLeft + startPointerX - currentPointerX;
}

export function syncHorizontalScroll(source: { scrollLeft: number } | null, target: { scrollLeft: number } | null): void {
  if (!source || !target) return;
  if (Math.abs(target.scrollLeft - source.scrollLeft) > 0.5) target.scrollLeft = source.scrollLeft;
}
