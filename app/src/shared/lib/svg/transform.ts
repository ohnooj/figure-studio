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

function asGraphicsElement(element: SVGElement): SVGGraphicsElement | null {
  return "getBBox" in element ? element as SVGGraphicsElement : null;
}
