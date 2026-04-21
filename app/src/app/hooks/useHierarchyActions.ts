import { elementKind } from "../../shared/lib/svg/selectability";
import { reparentElementPreservingWorldTransform } from "../../shared/lib/svg/transform";
import { endTraceOperation, startTraceOperation, traceOperationDuration } from "../../shared/lib/trace";
import type { HistorySnapshot } from "../../shared/types/editor";

export function useHierarchyActions(config: {
  activeFigureId: string;
  currentSnapshot: () => HistorySnapshot | null;
  pushHistoryCheckpoint: (figureId: string, snapshot: HistorySnapshot | null, key?: string, force?: boolean) => void;
  svgRoot: () => SVGSVGElement | null;
  selectedElement: () => SVGElement | null;
  selectedElements: () => SVGElement[];
  elementById: (id: string) => SVGElement | null;
  refreshSelection: (element?: SVGElement | SVGElement[] | null, options?: { rebuildTree?: boolean }) => void;
  scheduleSave: () => void;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  debugLog: (label: string, payload?: unknown) => void;
  selectedIdsRef: React.MutableRefObject<string[]>;
}) {
  function selectedTopLevelElements(): SVGElement[] {
    const elements = config.selectedElements().filter((element) => !(element instanceof SVGSVGElement));
    return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
  }

  function deleteSelected(): void {
    const operation = startTraceOperation(config.debugLog, "hierarchy.delete", {
      figureId: config.activeFigureId,
    });
    const elements = config.selectedElements();
    const root = config.svgRoot();
    if (!elements.length || !root) {
      endTraceOperation(config.debugLog, operation, { elementCount: 0 });
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "delete", true);
    const deleteStartedAt = performance.now();
    elements.forEach((element) => {
      if (element !== root) {
        element.remove();
      }
    });
    traceOperationDuration(config.debugLog, operation, "apply", deleteStartedAt, {
      elementIds: elements.map((element) => element.id),
    });
    const refreshStartedAt = performance.now();
    config.refreshSelection(null, { rebuildTree: true });
    traceOperationDuration(config.debugLog, operation, "selection", refreshStartedAt, {
      elementCount: elements.length,
    });
    config.scheduleSave();
    endTraceOperation(config.debugLog, operation, {
      elementIds: elements.map((element) => element.id),
      elementCount: elements.length,
    });
    config.setStatus("Deleted selection.");
  }

  function groupSelected(): void {
    const operation = startTraceOperation(config.debugLog, "hierarchy.group", {
      figureId: config.activeFigureId,
    });
    const elements = config.selectedElements();
    if (!elements.length) {
      endTraceOperation(config.debugLog, operation, { elementCount: 0 });
      return;
    }
    const parent = elements[0].parentNode;
    if (!(parent instanceof SVGGElement || parent instanceof SVGSVGElement)) {
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "group", true);
    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.id = `group-${Date.now()}`;
    wrapper.setAttribute("data-figure-role", "group");
    wrapper.setAttribute("data-figure-label", "group");
    const groupStartedAt = performance.now();
    parent.insertBefore(wrapper, elements[0]);
    elements.forEach((element) => wrapper.appendChild(element));
    traceOperationDuration(config.debugLog, operation, "apply", groupStartedAt, {
      wrapperId: wrapper.id,
      elementIds: elements.map((element) => element.id),
    });
    const refreshStartedAt = performance.now();
    config.refreshSelection(wrapper, { rebuildTree: true });
    traceOperationDuration(config.debugLog, operation, "selection", refreshStartedAt, {
      wrapperId: wrapper.id,
    });
    config.scheduleSave();
    endTraceOperation(config.debugLog, operation, {
      wrapperId: wrapper.id,
      elementIds: elements.map((element) => element.id),
    });
  }

  function ungroupSelected(): void {
    const operation = startTraceOperation(config.debugLog, "hierarchy.ungroup", {
      figureId: config.activeFigureId,
    });
    const element = config.selectedElement();
    if (!element || elementKind(element) !== "group") {
      endTraceOperation(config.debugLog, operation, { skipped: true });
      return;
    }
    const parent = element.parentNode;
    if (!(parent instanceof SVGGElement || parent instanceof SVGSVGElement)) {
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "ungroup", true);
    const ungroupStartedAt = performance.now();
    while (element.firstChild) {
      const child = element.firstChild;
      if (child instanceof SVGElement) {
        reparentElementPreservingWorldTransform(child, parent, element);
      } else {
        parent.insertBefore(child, element);
      }
    }
    traceOperationDuration(config.debugLog, operation, "apply", ungroupStartedAt, {
      groupId: element.id,
    });
    element.remove();
    const refreshStartedAt = performance.now();
    config.refreshSelection(null, { rebuildTree: true });
    traceOperationDuration(config.debugLog, operation, "selection", refreshStartedAt, {
      groupId: element.id,
    });
    config.scheduleSave();
    endTraceOperation(config.debugLog, operation, { groupId: element.id });
  }

  function moveNodeInTree(dragIds: string[], targetId: string | null): void {
    const operation = startTraceOperation(config.debugLog, "hierarchy.tree-move", {
      figureId: config.activeFigureId,
      dragIds,
      targetId: targetId ?? "canvas-root",
    });
    const root = config.svgRoot();
    if (!root) {
      endTraceOperation(config.debugLog, operation, { skipped: true, reason: "missing-root" });
      return;
    }
    const selectedIds = new Set(dragIds);
    const dragNodes = selectedTopLevelElements().filter((element) => selectedIds.has(element.id));
    const orderedDragNodes = (dragNodes.length
      ? dragNodes
      : dragIds
          .map((id) => root.querySelector<SVGElement>(`#${id}`))
          .filter((node): node is SVGElement => node instanceof SVGElement));
    const targetNode = targetId ? root.querySelector<SVGElement>(`#${targetId}`) : root;
    if (!orderedDragNodes.length || !targetNode) {
      endTraceOperation(config.debugLog, operation, { skipped: true, reason: "missing-target-or-nodes" });
      return;
    }
    if (orderedDragNodes.some((node) => node === targetNode)) {
      endTraceOperation(config.debugLog, operation, { skipped: true, reason: "self-target" });
      return;
    }
    if (targetNode instanceof SVGElement && orderedDragNodes.some((node) => node.contains(targetNode))) {
      endTraceOperation(config.debugLog, operation, { skipped: true, reason: "descendant-target" });
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "tree-move", true);
    const moveStartedAt = performance.now();
    if (targetNode instanceof SVGSVGElement) {
      orderedDragNodes.forEach((node) => reparentElementPreservingWorldTransform(node, targetNode));
    } else {
      const targetKind = elementKind(targetNode);
      if ((targetKind === "group" || targetKind === "panel") && targetNode instanceof SVGGElement) {
        orderedDragNodes.forEach((node) => reparentElementPreservingWorldTransform(node, targetNode));
      } else {
        const targetParent = targetNode.parentNode;
        if (targetParent instanceof SVGGElement || targetParent instanceof SVGSVGElement) {
          let insertBefore: ChildNode | null = targetNode.nextSibling;
          orderedDragNodes.forEach((node) => {
            reparentElementPreservingWorldTransform(node, targetParent, insertBefore);
            insertBefore = node.nextSibling;
          });
        }
      }
    }
    traceOperationDuration(config.debugLog, operation, "apply", moveStartedAt, {
      dragIds: orderedDragNodes.map((node) => node.id),
      targetId: targetId ?? "canvas-root",
    });
    const refreshStartedAt = performance.now();
    config.refreshSelection(orderedDragNodes, { rebuildTree: true });
    traceOperationDuration(config.debugLog, operation, "selection", refreshStartedAt, {
      dragIds: orderedDragNodes.map((node) => node.id),
    });
    config.scheduleSave();
    endTraceOperation(config.debugLog, operation, {
      dragIds: orderedDragNodes.map((node) => node.id),
      targetId: targetId ?? "canvas-root",
    });
  }

  function renameNodeLabel(id: string, label: string): void {
    const operation = startTraceOperation(config.debugLog, "hierarchy.rename", {
      figureId: config.activeFigureId,
      id,
      label,
    });
    const element = config.elementById(id);
    if (!element) {
      endTraceOperation(config.debugLog, operation, { skipped: true, reason: "missing-element" });
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "tree-rename", true);
    const renameStartedAt = performance.now();
    element.setAttribute("data-figure-label", label);
    traceOperationDuration(config.debugLog, operation, "apply", renameStartedAt, { id, label });
    const refreshStartedAt = performance.now();
    config.refreshSelection(
      config.selectedIdsRef.current.includes(id)
        ? config.selectedElements().map((node) => (node.id === id ? element : node))
        : config.selectedElements(),
      { rebuildTree: true },
    );
    traceOperationDuration(config.debugLog, operation, "selection", refreshStartedAt, { id, label });
    config.scheduleSave();
    endTraceOperation(config.debugLog, operation, { id, label });
    config.setStatus(`Renamed ${id}.`);
  }

  return {
    deleteSelected,
    groupSelected,
    ungroupSelected,
    moveNodeInTree,
    renameNodeLabel,
  };
}
