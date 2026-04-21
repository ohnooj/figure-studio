import type { ObjectNode } from "../../types/editor";
import { elementKind } from "./selectability";

export function buildObjectTree(root: SVGSVGElement): ObjectNode[] {
  return directChildren(root)
    .map((element) => buildNode(element))
    .filter((node): node is ObjectNode => node !== null);
}

function buildNode(element: SVGElement): ObjectNode | null {
  if (!element.id) {
    return null;
  }
  return {
    id: element.id,
    label: element.getAttribute("data-figure-label") || element.id,
    kind: elementKind(element),
    children: directChildren(element).map((child) => buildNode(child)).filter((node): node is ObjectNode => node !== null),
  };
}

function directChildren(root: SVGElement): SVGElement[] {
  return Array.from(root.children).filter((child): child is SVGElement => child instanceof SVGElement && Boolean(child.id));
}
