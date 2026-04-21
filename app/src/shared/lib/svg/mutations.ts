import { elementFrame } from "./selection";
import { setTransformMatrix } from "./transform";

export const MIN_ELEMENT_SIZE = 12;

type TextTransformSnapshot = {
  id: string;
  matrix: DOMMatrix;
};

export function localTransformSnapshot(element: SVGElement): DOMMatrix {
  const graphic = asGraphicsElement(element);
  const consolidated = graphic?.transform.baseVal.consolidate();
  return consolidated
    ? new DOMMatrix([
        consolidated.matrix.a,
        consolidated.matrix.b,
        consolidated.matrix.c,
        consolidated.matrix.d,
        consolidated.matrix.e,
        consolidated.matrix.f,
      ])
    : new DOMMatrix();
}

export function snapshotDescendantTextTransforms(element: SVGElement): TextTransformSnapshot[] {
  return Array.from(element.querySelectorAll("text"))
    .filter((node): node is SVGTextElement => node instanceof SVGTextElement && Boolean(node.id))
    .map((node) => ({ id: node.id, matrix: localTransformSnapshot(node) }));
}

export function setElementPosition(element: SVGElement, x: number, y: number): void {
  if (element instanceof SVGRectElement || element instanceof SVGImageElement || element instanceof SVGForeignObjectElement) {
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y));
    return;
  }
  if (element instanceof SVGTextElement) {
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y + currentHeight(element)));
    return;
  }
  if (element instanceof SVGLineElement) {
    const frame = elementFrame(element);
    const dx = x - frame.x;
    const dy = y - frame.y;
    element.setAttribute("x1", String(element.x1.baseVal.value + dx));
    element.setAttribute("y1", String(element.y1.baseVal.value + dy));
    element.setAttribute("x2", String(element.x2.baseVal.value + dx));
    element.setAttribute("y2", String(element.y2.baseVal.value + dy));
    return;
  }
  const frame = elementFrame(element);
  const matrix = localTransformSnapshot(element).translate(x - frame.x, y - frame.y);
  setTransformMatrix(element, matrix);
}

export function setElementFrame(element: SVGElement, x: number, y: number, width: number, height: number): { afterWorld: { x: number; y: number; width: number; height: number } } {
  const nextWidth = Math.max(MIN_ELEMENT_SIZE, width);
  const nextHeight = Math.max(MIN_ELEMENT_SIZE, height);
  if (element instanceof SVGRectElement || element instanceof SVGImageElement || element instanceof SVGForeignObjectElement) {
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y));
    element.setAttribute("width", String(nextWidth));
    element.setAttribute("height", String(nextHeight));
  } else if (element instanceof SVGEllipseElement) {
    element.setAttribute("cx", String(x + nextWidth / 2));
    element.setAttribute("cy", String(y + nextHeight / 2));
    element.setAttribute("rx", String(nextWidth / 2));
    element.setAttribute("ry", String(nextHeight / 2));
  } else if (element instanceof SVGCircleElement) {
    const radius = Math.max(nextWidth, nextHeight) / 2;
    element.setAttribute("cx", String(x + radius));
    element.setAttribute("cy", String(y + radius));
    element.setAttribute("r", String(radius));
  } else if (element instanceof SVGLineElement) {
    element.setAttribute("x1", String(x));
    element.setAttribute("y1", String(y));
    element.setAttribute("x2", String(x + nextWidth));
    element.setAttribute("y2", String(y + nextHeight));
  } else {
    setElementPosition(element, x, y);
  }
  return { afterWorld: elementFrame(element) };
}

export function resizeElementFromSnapshot(
  element: SVGElement,
  _startTransform: DOMMatrix,
  _startFrame: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
  _textSnapshots: TextTransformSnapshot[],
): { afterWorld: { x: number; y: number; width: number; height: number } } {
  return setElementFrame(element, frame.x, frame.y, frame.width, frame.height);
}

export function scaleElementFromSnapshot(
  element: SVGElement,
  _startTransform: DOMMatrix,
  _startFrame: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
  _textSnapshots: TextTransformSnapshot[],
): { afterWorld: { x: number; y: number; width: number; height: number } } {
  return setElementFrame(element, frame.x, frame.y, frame.width, frame.height);
}

export function setNumericAttribute(element: SVGElement, name: string, value: number): void {
  element.setAttribute(name, String(value));
}

export function setStyleAttribute(element: SVGElement, name: string, value: string): void {
  if (!value.trim()) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

export function setWorldRotation(element: SVGElement, degrees: number): void {
  const frame = elementFrame(element);
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  element.setAttribute("transform", `rotate(${degrees} ${cx} ${cy})`);
}

function currentHeight(element: SVGElement): number {
  try {
    const box = (element as SVGGraphicsElement).getBBox();
    return box.height || 16;
  } catch {
    return 16;
  }
}

function asGraphicsElement(element: SVGElement): SVGGraphicsElement | null {
  return "getBBox" in element ? element as SVGGraphicsElement : null;
}
