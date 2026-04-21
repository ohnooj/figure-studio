import type { EditableKind, SelectedElement } from "../../types/editor";
import { elementKind } from "./selectability";

export function selectedFromElement(element: SVGElement): SelectedElement {
  const frame = elementFrame(element);
  const kind = elementKind(element);
  const textNode = element instanceof SVGTextElement ? element : element.querySelector("text");
  return {
    id: element.id,
    kind,
    label: element.getAttribute("data-figure-label") || element.id || kind,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: currentRotation(element),
    text: textNode?.textContent?.trim() ?? "",
    assetPath: element.getAttribute("data-asset-path") ?? "",
    canResize: kind !== "curve",
    canScale: kind !== "text",
  };
}

export function selectedFromElements(elements: SVGElement[]): SelectedElement {
  if (elements.length === 1) {
    return selectedFromElement(elements[0]);
  }
  const boxes = elements.map((element) => elementFrame(element));
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    id: elements.map((element) => element.id).join(","),
    kind: "group",
    label: `${elements.length} items`,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    rotation: 0,
    text: "",
    assetPath: "",
    canResize: false,
    canScale: false,
    selectionCount: elements.length,
  };
}

export function overlayRectFromElement(element: SVGElement): DOMRect {
  return element.getBoundingClientRect();
}

export function overlayRectFromElements(elements: SVGElement[]): DOMRect {
  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

export function allSelectableElements(root: SVGSVGElement): SVGElement[] {
  return Array.from(root.querySelectorAll<SVGElement>("[id]")).filter((element) => !(element instanceof SVGSVGElement));
}

export function clientPointToElementLocal(
  element: SVGElement,
  clientX: number,
  clientY: number,
  inverseOverride?: DOMMatrix,
): { x: number; y: number } | null {
  const point = new DOMPoint(clientX, clientY);
  const graphic = asGraphicsElement(element);
  const inverse = inverseOverride ?? graphic?.getScreenCTM()?.inverse();
  if (!inverse) {
    return null;
  }
  const transformed = point.matrixTransform(inverse);
  return { x: transformed.x, y: transformed.y };
}

export function elementFrame(element: SVGElement): { x: number; y: number; width: number; height: number } {
  const local = localFrame(element);
  const ctm = asGraphicsElement(element)?.getCTM();
  if (!ctm) {
    return local;
  }
  const corners = [
    new DOMPoint(local.x, local.y),
    new DOMPoint(local.x + local.width, local.y),
    new DOMPoint(local.x, local.y + local.height),
    new DOMPoint(local.x + local.width, local.y + local.height),
  ].map((point) => point.matrixTransform(ctm));
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const bottom = Math.max(...corners.map((point) => point.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function elementsIntersectingWorldRect(
  root: SVGSVGElement,
  rect: { x: number; y: number; width: number; height: number },
): SVGElement[] {
  return allSelectableElements(root).filter((element) => intersects(elementFrame(element), rect));
}

function intersects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function localFrame(element: SVGElement): { x: number; y: number; width: number; height: number } {
  if (element instanceof SVGSVGElement) {
    const viewBox = element.viewBox.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
      return { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height };
    }
  }
  if (element instanceof SVGRectElement || element instanceof SVGImageElement || element instanceof SVGForeignObjectElement) {
    return {
      x: element.x.baseVal.value,
      y: element.y.baseVal.value,
      width: element.width.baseVal.value,
      height: element.height.baseVal.value,
    };
  }
  if (element instanceof SVGTextElement) {
    const box = safeBBox(element);
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  if (element instanceof SVGEllipseElement) {
    return {
      x: element.cx.baseVal.value - element.rx.baseVal.value,
      y: element.cy.baseVal.value - element.ry.baseVal.value,
      width: element.rx.baseVal.value * 2,
      height: element.ry.baseVal.value * 2,
    };
  }
  if (element instanceof SVGCircleElement) {
    return {
      x: element.cx.baseVal.value - element.r.baseVal.value,
      y: element.cy.baseVal.value - element.r.baseVal.value,
      width: element.r.baseVal.value * 2,
      height: element.r.baseVal.value * 2,
    };
  }
  if (element instanceof SVGLineElement) {
    const x = Math.min(element.x1.baseVal.value, element.x2.baseVal.value);
    const y = Math.min(element.y1.baseVal.value, element.y2.baseVal.value);
    return {
      x,
      y,
      width: Math.abs(element.x2.baseVal.value - element.x1.baseVal.value) || 1,
      height: Math.abs(element.y2.baseVal.value - element.y1.baseVal.value) || 1,
    };
  }
  const graphic = asGraphicsElement(element);
  if (!graphic) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const box = safeBBox(graphic);
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function safeBBox(element: SVGGraphicsElement): DOMRect {
  try {
    const box = element.getBBox();
    return new DOMRect(box.x, box.y, box.width || 1, box.height || 1);
  } catch {
    return new DOMRect(0, 0, 1, 1);
  }
}

function currentRotation(element: SVGElement): number {
  const matrix = asGraphicsElement(element)?.getCTM();
  if (!matrix) {
    return 0;
  }
  return Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI * 1000) / 1000;
}

function asGraphicsElement(element: SVGElement): SVGGraphicsElement | null {
  return "getBBox" in element ? element as SVGGraphicsElement : null;
}
