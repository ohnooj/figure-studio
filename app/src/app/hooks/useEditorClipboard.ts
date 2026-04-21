import { useRef } from "react";

import { ensureSelectableIds } from "../../shared/lib/svg/selectability";
import { elementLocalToWorldMatrix, setTransformMatrix } from "../../shared/lib/svg/transform";
import { endTraceOperation, startTraceOperation, traceOperationDuration } from "../../shared/lib/trace";

import type { HistorySnapshot } from "../../shared/types/editor";

function uniqueElementId(usedIds: Set<string>, base: string): string {
  const stem = (base || "item").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  let candidate = stem;
  let counter = 1;
  while (usedIds.has(candidate)) {
    candidate = `${stem}-${counter++}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function rewriteCloneIds(rootElement: SVGElement, liveRoot: SVGSVGElement): void {
  const usedIds = new Set(Array.from(liveRoot.querySelectorAll("[id]"), (node) => node.id).filter(Boolean));
  const idMap = new Map<string, string>();
  const nodes = [rootElement, ...Array.from(rootElement.querySelectorAll("*"))].filter(
    (node): node is SVGElement => node instanceof SVGElement,
  );

  nodes.forEach((node) => {
    if (!node.id) {
      return;
    }
    const nextId = uniqueElementId(usedIds, node.id);
    idMap.set(node.id, nextId);
    node.id = nextId;
  });

  const rewriteValue = (value: string): string => {
    let next = value.replace(/url\(#([^)]+)\)/g, (match, id) => (idMap.has(id) ? `url(#${idMap.get(id)})` : match));
    if (next.startsWith("#")) {
      const referenced = next.slice(1);
      if (idMap.has(referenced)) {
        next = `#${idMap.get(referenced)}`;
      }
    }
    return next;
  };

  nodes.forEach((node) => {
    ["data-placeholder-id", "data-slot-target"].forEach((attribute) => {
      const value = node.getAttribute(attribute);
      if (value && idMap.has(value)) {
        node.setAttribute(attribute, idMap.get(value) ?? value);
      }
    });
    ["href", "xlink:href", "clip-path", "mask", "filter", "fill", "stroke", "marker-start", "marker-mid", "marker-end"].forEach((attribute) => {
      const value = node.getAttribute(attribute);
      if (value) {
        node.setAttribute(attribute, rewriteValue(value));
      }
    });
    ["aria-labelledby", "aria-describedby"].forEach((attribute) => {
      const value = node.getAttribute(attribute);
      if (!value) {
        return;
      }
      node.setAttribute(
        attribute,
        value
          .split(/\s+/)
          .map((token) => idMap.get(token) ?? token)
          .join(" "),
      );
    });
  });
}

export function useEditorClipboard(config: {
  activeFigureId: string;
  currentSnapshot: () => HistorySnapshot | null;
  pushHistoryCheckpoint: (figureId: string, snapshot: HistorySnapshot | null, key?: string, force?: boolean) => void;
  svgRoot: () => SVGSVGElement | null;
  selectedElements: () => SVGElement[];
  refreshSelection: (element?: SVGElement | SVGElement[] | null, options?: { rebuildTree?: boolean }) => void;
  scheduleSave: () => void;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  debugLog: (label: string, payload?: unknown) => void;
}) {
  const clipboardRef = useRef<Array<{ node: SVGElement; worldMatrix: DOMMatrix }>>([]);
  const pasteCountRef = useRef(0);

  function selectedTopLevelElements(): SVGElement[] {
    const elements = config.selectedElements().filter((element) => !(element instanceof SVGSVGElement));
    return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
  }

  function copySelection(): void {
    const operation = startTraceOperation(config.debugLog, "clipboard.copy", {
      figureId: config.activeFigureId,
    });
    const collectStartedAt = performance.now();
    const elements = selectedTopLevelElements();
    if (!elements.length) {
      endTraceOperation(config.debugLog, operation, { elementCount: 0 });
      return;
    }
    clipboardRef.current = elements.map((element) => ({
      node: element.cloneNode(true) as SVGElement,
      worldMatrix: elementLocalToWorldMatrix(element),
    }));
    pasteCountRef.current = 0;
    traceOperationDuration(config.debugLog, operation, "collect", collectStartedAt, {
      elementIds: elements.map((element) => element.id),
      elementCount: elements.length,
    });
    endTraceOperation(config.debugLog, operation, {
      elementIds: elements.map((element) => element.id),
      elementCount: elements.length,
    });
    config.setStatus(`Copied ${elements.length} object${elements.length === 1 ? "" : "s"}.`);
  }

  function pasteSelection(): void {
    const operation = startTraceOperation(config.debugLog, "clipboard.paste", {
      figureId: config.activeFigureId,
    });
    const root = config.svgRoot();
    if (!root || !clipboardRef.current.length) {
      endTraceOperation(config.debugLog, operation, { elementCount: 0 });
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "paste", true);
    pasteCountRef.current += 1;
    const offset = 24 * pasteCountRef.current;
    const translation = new DOMMatrix().translate(offset, offset);
    const pasted: SVGElement[] = [];
    const cloneStartedAt = performance.now();

    clipboardRef.current.forEach((entry) => {
      const clone = entry.node.cloneNode(true);
      if (!(clone instanceof SVGElement)) {
        return;
      }
      rewriteCloneIds(clone, root);
      root.appendChild(clone);
      setTransformMatrix(clone, translation.multiply(entry.worldMatrix));
      pasted.push(clone);
    });
    traceOperationDuration(config.debugLog, operation, "clone", cloneStartedAt, {
      elementCount: pasted.length,
      offset,
    });

    const selectStartedAt = performance.now();
    ensureSelectableIds(root);
    config.refreshSelection(pasted, { rebuildTree: true });
    traceOperationDuration(config.debugLog, operation, "selection", selectStartedAt, {
      elementIds: pasted.map((element) => element.id),
      offset,
    });
    const saveStartedAt = performance.now();
    config.scheduleSave();
    traceOperationDuration(config.debugLog, operation, "schedule-save", saveStartedAt, {
      elementIds: pasted.map((element) => element.id),
    });
    endTraceOperation(config.debugLog, operation, {
      elementIds: pasted.map((element) => element.id),
      elementCount: pasted.length,
      offset,
    });
    config.setStatus(`Pasted ${pasted.length} object${pasted.length === 1 ? "" : "s"}.`);
  }

  function selectAllObjects(): void {
    const operation = startTraceOperation(config.debugLog, "selection.select-all", {
      figureId: config.activeFigureId,
    });
    const root = config.svgRoot();
    if (!root) {
      endTraceOperation(config.debugLog, operation, { skipped: true });
      return;
    }
    const collectStartedAt = performance.now();
    const all = Array.from(root.querySelectorAll<SVGElement>("[id]")).filter((element) => !(element instanceof SVGSVGElement));
    traceOperationDuration(config.debugLog, operation, "collect", collectStartedAt, {
      elementCount: all.length,
    });
    const refreshStartedAt = performance.now();
    config.refreshSelection(all);
    traceOperationDuration(config.debugLog, operation, "selection", refreshStartedAt, {
      elementCount: all.length,
    });
    endTraceOperation(config.debugLog, operation, {
      elementCount: all.length,
    });
    config.setStatus(all.length ? `Selected ${all.length} objects.` : "No objects to select.");
  }

  return {
    copySelection,
    pasteSelection,
    selectAllObjects,
  };
}
