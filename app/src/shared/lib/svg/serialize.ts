import type { AttributeEntry, InspectorCapabilities, InspectorStyle } from "../../types/editor";
import { elementKind } from "./selectability";

const STYLE_FIELDS: Array<keyof InspectorStyle> = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "rx",
  "ry",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
];

export function prepareSvgForPreview(svg: string, figureId: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.querySelector("svg");
  if (!(root instanceof SVGSVGElement)) {
    throw new Error(`Invalid SVG for ${figureId}.`);
  }
  return root;
}

export function serializeSvg(root: SVGSVGElement): string {
  return `${new XMLSerializer().serializeToString(root)}\n`;
}

export function absoluteAssetHref(figureIdOrPath: string, assetPath?: string): string {
  if (!assetPath) {
    return figureIdOrPath;
  }
  const normalized = assetPath.replace(/^\/+/, "");
  return `/api/figures/${encodeURIComponent(figureIdOrPath)}/files/${normalized}`;
}

export function visibleAttributes(element: SVGElement): AttributeEntry[] {
  return Array.from(element.attributes)
    .filter((attribute) => !attribute.name.startsWith("data-editor-"))
    .map((attribute) => ({ name: attribute.name, value: attribute.value }));
}

export function visibleSharedAttributes(elements: SVGElement[]): AttributeEntry[] {
  if (!elements.length) {
    return [];
  }
  const first = new Map(visibleAttributes(elements[0]).map((entry) => [entry.name, entry.value]));
  for (const element of elements.slice(1)) {
    for (const [name, value] of [...first.entries()]) {
      if (element.getAttribute(name) !== value) {
        first.delete(name);
      }
    }
  }
  return [...first.entries()].map(([name, value]) => ({ name, value }));
}

export function resolvedInspectorStyle(element: SVGElement): InspectorStyle {
  return Object.fromEntries(
    STYLE_FIELDS.map((field) => [field, element.getAttribute(field) ?? ""]),
  ) as InspectorStyle;
}

export function inspectorCapabilities(element: SVGElement): InspectorCapabilities {
  const kind = elementKind(element);
  const isText = kind === "text";
  const isRect = element instanceof SVGRectElement;
  return {
    showAppearance: true,
    showFill: true,
    showStroke: !isText,
    showStrokeWidth: !isText,
    showStrokeDash: !isText,
    showLineCap: !isText,
    showLineJoin: !isText,
    showOpacity: true,
    showFillOpacity: true,
    showStrokeOpacity: !isText,
    showRadius: isRect,
    showTypography: isText,
  };
}
