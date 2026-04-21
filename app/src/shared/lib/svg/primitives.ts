import type { ToolMode } from "../../types/editor";

const SVG_NS = "http://www.w3.org/2000/svg";

export function createPrimitiveElement(root: SVGSVGElement, mode: ToolMode, start: { x: number; y: number }): SVGElement {
  const id = `${mode}-${Date.now()}`;
  let element: SVGElement;
  if (mode === "ellipse") {
    element = document.createElementNS(SVG_NS, "ellipse");
    element.setAttribute("cx", String(start.x));
    element.setAttribute("cy", String(start.y));
    element.setAttribute("rx", "1");
    element.setAttribute("ry", "1");
  } else if (mode === "line" || mode === "arrow") {
    element = document.createElementNS(SVG_NS, "line");
    element.setAttribute("x1", String(start.x));
    element.setAttribute("y1", String(start.y));
    element.setAttribute("x2", String(start.x + 1));
    element.setAttribute("y2", String(start.y + 1));
  } else if (mode === "text") {
    element = document.createElementNS(SVG_NS, "text");
    element.setAttribute("x", String(start.x));
    element.setAttribute("y", String(start.y));
    element.textContent = "Text";
  } else {
    element = document.createElementNS(SVG_NS, mode === "curve" ? "path" : "rect");
    element.setAttribute("x", String(start.x));
    element.setAttribute("y", String(start.y));
    element.setAttribute("width", "1");
    element.setAttribute("height", "1");
    if (mode === "rounded-rectangle") {
      element.setAttribute("rx", "12");
      element.setAttribute("ry", "12");
    }
  }
  element.id = id;
  element.setAttribute("data-editable", "true");
  element.setAttribute("data-figure-role", mode === "image-slot" ? "slot" : mode === "text" ? "text" : "item");
  element.setAttribute("fill", mode === "line" || mode === "arrow" ? "none" : "#d8e2ff");
  element.setAttribute("stroke", "#20304d");
  element.setAttribute("stroke-width", "2");
  root.appendChild(element);
  return element;
}

export function updatePrimitiveElement(
  element: SVGElement,
  mode: ToolMode,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.max(1, Math.abs(end.x - start.x));
  const height = Math.max(1, Math.abs(end.y - start.y));
  if (element instanceof SVGRectElement) {
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y));
    element.setAttribute("width", String(width));
    element.setAttribute("height", String(height));
    return;
  }
  if (element instanceof SVGEllipseElement) {
    element.setAttribute("cx", String(x + width / 2));
    element.setAttribute("cy", String(y + height / 2));
    element.setAttribute("rx", String(width / 2));
    element.setAttribute("ry", String(height / 2));
    return;
  }
  if (element instanceof SVGLineElement) {
    element.setAttribute("x1", String(start.x));
    element.setAttribute("y1", String(start.y));
    element.setAttribute("x2", String(end.x));
    element.setAttribute("y2", String(end.y));
    if (mode === "arrow") {
      element.setAttribute("marker-end", "url(#arrowhead)");
    }
  }
}
