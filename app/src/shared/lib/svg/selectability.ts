import type { EditableKind } from "../../types/editor";

const SVG_NS = "http://www.w3.org/2000/svg";

export function elementKind(element: SVGElement): EditableKind {
  const role = (element.getAttribute("data-figure-role") ?? "").trim() as EditableKind;
  if (role) {
    return role;
  }
  if (element instanceof SVGTextElement) {
    return "text";
  }
  if (element instanceof SVGImageElement) {
    return "slot";
  }
  if (element instanceof SVGLineElement || element instanceof SVGPathElement || element instanceof SVGPolylineElement) {
    return "curve";
  }
  if (element instanceof SVGRectElement || element instanceof SVGCircleElement || element instanceof SVGEllipseElement) {
    return "item";
  }
  if (element instanceof SVGGElement) {
    return "group";
  }
  if (element instanceof SVGSVGElement) {
    return "canvas";
  }
  return "item";
}

export function ensureSelectableIds(root: SVGSVGElement): void {
  let counter = 1;
  for (const element of allEditableElements(root)) {
    if (!element.id) {
      element.id = `${elementKind(element)}-${counter += 1}`;
    }
    element.setAttribute("data-editable", "true");
  }
}

export function getEditableElement(target: EventTarget | null): SVGElement | null {
  const node = target instanceof Node ? target : null;
  if (!node) {
    return null;
  }
  const found = node instanceof SVGElement ? node.closest<SVGElement>("[data-editable='true'], [data-figure-role], svg [id]") : null;
  if (!found || found instanceof SVGSVGElement) {
    return null;
  }
  return found;
}

export function getEditableElementAtPoint(target: EventTarget | null, _clientX: number, _clientY: number): SVGElement | null {
  return getEditableElement(target);
}

function allEditableElements(root: SVGSVGElement): SVGElement[] {
  return Array.from(root.querySelectorAll<SVGElement>("g, rect, image, text, line, path, ellipse, circle, polyline, polygon"))
    .filter((element) => element.namespaceURI === SVG_NS);
}
