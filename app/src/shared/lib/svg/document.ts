export function svgViewBox(root: SVGSVGElement | null): { x: number; y: number; width: number; height: number } {
  if (!root) {
    return { x: 0, y: 0, width: 1400, height: 860 };
  }
  const raw = root.getAttribute("viewBox");
  if (raw) {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = numericAttr(root, "width", 1400);
  const height = numericAttr(root, "height", 860);
  return { x: 0, y: 0, width, height };
}

function numericAttr(element: SVGElement, name: string, fallback: number): number {
  const raw = Number.parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
