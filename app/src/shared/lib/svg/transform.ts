import { elementFrame } from "./selection";

export function elementLocalToWorldMatrix(element: SVGElement): DOMMatrix {
  return asGraphicsElement(element)?.getCTM() ?? new DOMMatrix();
}

export function elementScreenToLocalMatrix(element: SVGElement): DOMMatrix | null {
  return asGraphicsElement(element)?.getScreenCTM()?.inverse() ?? null;
}

export function setTransformMatrix(element: SVGElement, matrix: DOMMatrix): void {
  element.setAttribute("transform", `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
}

export function reparentElementPreservingWorldTransform(
  element: SVGElement,
  nextParent: SVGElement,
  insertBefore: ChildNode | null = null,
): void {
  const currentWorld = asGraphicsElement(element)?.getCTM() ?? new DOMMatrix();
  nextParent.insertBefore(element, insertBefore);
  const parentWorld = asGraphicsElement(nextParent)?.getCTM() ?? new DOMMatrix();
  setTransformMatrix(element, parentWorld.inverse().multiply(currentWorld));
}

export function elementWorldToLocalRect(element: SVGElement): { x: number; y: number; width: number; height: number } {
  const frame = elementFrame(element);
  const parentGraphic = element.parentElement && "getCTM" in element.parentElement ? element.parentElement as unknown as SVGGraphicsElement : null;
  const inverse = (parentGraphic?.getCTM() ?? new DOMMatrix()).inverse();
  const topLeft = new DOMPoint(frame.x, frame.y).matrixTransform(inverse);
  const bottomRight = new DOMPoint(frame.x + frame.width, frame.y + frame.height).matrixTransform(inverse);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

function asGraphicsElement(element: SVGElement): SVGGraphicsElement | null {
  return "getBBox" in element ? element as SVGGraphicsElement : null;
}
