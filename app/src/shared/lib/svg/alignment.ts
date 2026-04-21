import type { AlignmentGuide } from "../../types/editor";
import { allSelectableElements, elementFrame } from "./selection";

type AlignmentTarget = {
  x1: number;
  x2: number;
  xc: number;
  y1: number;
  y2: number;
  yc: number;
};

export function buildAlignmentTargets(
  root: SVGSVGElement,
  moving: SVGElement[],
  artboard: { x: number; y: number; width: number; height: number },
): AlignmentTarget[] {
  const movingIds = new Set(moving.map((element) => element.id));
  const targets = allSelectableElements(root)
    .filter((element) => !movingIds.has(element.id))
    .map((element) => fromRect(elementFrame(element)));
  targets.push(fromRect(artboard));
  return targets;
}

export function computeAlignmentGuidesFromTargets(
  targets: AlignmentTarget[],
  proposed: DOMRect,
  threshold = 8,
): { dx: number; dy: number; guides: AlignmentGuide[] } {
  const current = fromRect(proposed);
  let dx = 0;
  let dy = 0;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  const guides: AlignmentGuide[] = [];
  for (const target of targets) {
    for (const [source, dest] of [[current.x1, target.x1], [current.x2, target.x2], [current.xc, target.xc]] as const) {
      const delta = dest - source;
      if (Math.abs(delta) < Math.abs(bestX) && Math.abs(delta) <= threshold) {
        bestX = delta;
        dx = delta;
        guides.push({ orientation: "vertical", position: dest, start: Math.min(current.y1, target.y1), end: Math.max(current.y2, target.y2) });
      }
    }
    for (const [source, dest] of [[current.y1, target.y1], [current.y2, target.y2], [current.yc, target.yc]] as const) {
      const delta = dest - source;
      if (Math.abs(delta) < Math.abs(bestY) && Math.abs(delta) <= threshold) {
        bestY = delta;
        dy = delta;
        guides.push({ orientation: "horizontal", position: dest, start: Math.min(current.x1, target.x1), end: Math.max(current.x2, target.x2) });
      }
    }
  }
  return { dx, dy, guides: guides.slice(-2) };
}

function fromRect(rect: { x: number; y: number; width: number; height: number }): AlignmentTarget {
  return {
    x1: rect.x,
    x2: rect.x + rect.width,
    xc: rect.x + rect.width / 2,
    y1: rect.y,
    y2: rect.y + rect.height,
    yc: rect.y + rect.height / 2,
  };
}
