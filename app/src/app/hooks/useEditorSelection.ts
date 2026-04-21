import { useCallback, useEffect, useState, type MutableRefObject, type RefObject } from "react";

import { ensureSelectableIds } from "../../shared/lib/svg/selectability";
import { buildObjectTree } from "../../shared/lib/svg/tree";
import { allSelectableElements, overlayRectFromElements, overlayRectFromElement, selectedFromElement, selectedFromElements } from "../../shared/lib/svg/selection";
import { prepareSvgForPreview, serializeSvg, inspectorCapabilities, resolvedInspectorStyle, visibleAttributes, visibleSharedAttributes } from "../../shared/lib/svg/serialize";
import { endTraceOperation, startTraceOperation, traceOperationDuration } from "../../shared/lib/trace";
import type { AttributeEntry, FigureSource, InspectorCapabilities, InspectorStyle, ObjectNode, SelectedElement, SelectionBox } from "../../shared/types/editor";

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
}

export function useEditorSelection(config: {
  svgHostRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  selectedIdsRef: MutableRefObject<string[]>;
  debugLog?: (label: string, payload?: unknown) => void;
}) {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [objectTree, setObjectTree] = useState<ObjectNode[]>([]);
  const [selectedAttributes, setSelectedAttributes] = useState<AttributeEntry[]>([]);
  const [selectedResolvedStyle, setSelectedResolvedStyle] = useState<InspectorStyle | null>(null);
  const [selectedInspectorCapabilities, setSelectedInspectorCapabilities] = useState<InspectorCapabilities | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const svgRoot = useCallback((): SVGSVGElement | null => {
    return config.svgHostRef.current?.querySelector("svg") ?? null;
  }, [config.svgHostRef]);

  const selectedElement = useCallback((): SVGElement | null => {
    const root = svgRoot();
    const id = config.selectedIdsRef.current[config.selectedIdsRef.current.length - 1];
    if (!root || !id) {
      return null;
    }
    const found = root.querySelector<SVGElement>(`#${id}`);
    return found instanceof SVGElement ? found : null;
  }, [config.selectedIdsRef, svgRoot]);

  const selectedElements = useCallback((): SVGElement[] => {
    const root = svgRoot();
    if (!root || !config.selectedIdsRef.current.length) {
      return [];
    }
    return config.selectedIdsRef.current
      .map((id) => root.querySelector<SVGElement>(`#${id}`))
      .filter((node): node is SVGElement => node instanceof SVGElement);
  }, [config.selectedIdsRef, svgRoot]);

  const elementById = useCallback((id: string): SVGElement | null => {
    const root = svgRoot();
    if (!root || !id) {
      return null;
    }
    const found = root.querySelector<SVGElement>(`#${id}`);
    return found instanceof SVGElement ? found : null;
  }, [svgRoot]);

  const editableTextNode = useCallback((element: SVGElement | null): SVGTextElement | null => {
    if (!element) {
      return null;
    }
    if (element instanceof SVGTextElement) {
      return element;
    }
    const nested = element.querySelector("text");
    return nested instanceof SVGTextElement ? nested : null;
  }, []);

  const rebuildObjectTree = useCallback((rootOverride?: SVGSVGElement | null): void => {
    const operation = startTraceOperation(config.debugLog, "selection.rebuild-tree");
    const applyStartedAt = performance.now();
    const root = rootOverride ?? svgRoot();
    setObjectTree(root ? buildObjectTree(root) : []);
    traceOperationDuration(config.debugLog, operation, "apply", applyStartedAt, {
      hasRoot: Boolean(root),
    });
    endTraceOperation(config.debugLog, operation, { hasRoot: Boolean(root) });
  }, [svgRoot]);

  const markSelectedElements = useCallback((next: SVGElement[]): void => {
    const root = svgRoot();
    if (!root) {
      return;
    }
    root.querySelectorAll("[data-editor-selected='true']").forEach((node) => {
      node.removeAttribute("data-editor-selected");
    });
    next.forEach((node) => node.setAttribute("data-editor-selected", "true"));
  }, [svgRoot]);

  const resolveElements = useCallback((elementOverride?: SVGElement | SVGElement[] | null): SVGElement[] => {
    return Array.isArray(elementOverride)
      ? elementOverride
      : elementOverride === undefined
        ? selectedElements()
        : elementOverride
          ? [elementOverride]
          : [];
  }, [selectedElements]);

  const updateSelectionView = useCallback((elements: SVGElement[], options?: { updateAttributes?: boolean }): void => {
    if (!elements.length) {
      setSelected(null);
      setSelectionBox(null);
      if (options?.updateAttributes !== false) {
        setSelectedAttributes([]);
        setSelectedResolvedStyle(null);
        setSelectedInspectorCapabilities(null);
      }
      return;
    }
    const nextSelected = selectedFromElements(elements);
    const preview = config.canvasViewportRef.current;
    setSelected(nextSelected);
    if (options?.updateAttributes !== false) {
      setSelectedAttributes(elements.length === 1 ? visibleAttributes(elements[0]) : visibleSharedAttributes(elements));
      setSelectedResolvedStyle(elements.length === 1 ? resolvedInspectorStyle(elements[0]) : null);
      setSelectedInspectorCapabilities(elements.length === 1 ? inspectorCapabilities(elements[0]) : null);
    }
    if (!preview) {
      return;
    }
    const rect = elements.length === 1 ? overlayRectFromElement(elements[0]) : overlayRectFromElements(elements);
    const previewRect = preview.getBoundingClientRect();
    if (rect) {
      setSelectionBox({
        left: rect.left - previewRect.left,
        top: rect.top - previewRect.top,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setSelectionBox(null);
    }
  }, [config.canvasViewportRef]);

  const refreshSelection = useCallback((elementOverride?: SVGElement | SVGElement[] | null, options?: { rebuildTree?: boolean }): void => {
    const operation = startTraceOperation(config.debugLog, "selection.refresh", {
      rebuildTree: Boolean(options?.rebuildTree),
    });
    const resolveStartedAt = performance.now();
    const elements = resolveElements(elementOverride);
    traceOperationDuration(config.debugLog, operation, "resolve", resolveStartedAt, {
      elementCount: elements.length,
      elementIds: elements.map((element) => element.id),
    });
    if (options?.rebuildTree) {
      const rebuildStartedAt = performance.now();
      rebuildObjectTree();
      traceOperationDuration(config.debugLog, operation, "rebuild-tree", rebuildStartedAt, {});
    }
    if (!elements.length) {
      const markStartedAt = performance.now();
      config.selectedIdsRef.current = [];
      setSelectedIds((current) => (current.length ? [] : current));
      markSelectedElements([]);
      traceOperationDuration(config.debugLog, operation, "mark-dom", markStartedAt, {
        elementCount: 0,
      });
      const viewStartedAt = performance.now();
      updateSelectionView([], { updateAttributes: true });
      traceOperationDuration(config.debugLog, operation, "view", viewStartedAt, {
        elementCount: 0,
      });
      endTraceOperation(config.debugLog, operation, { elementCount: 0 });
      return;
    }
    const markStartedAt = performance.now();
    const nextIds = elements.map((element) => element.id);
    config.selectedIdsRef.current = nextIds;
    setSelectedIds((current) => (sameIds(current, nextIds) ? current : nextIds));
    markSelectedElements(elements);
    traceOperationDuration(config.debugLog, operation, "mark-dom", markStartedAt, {
      elementCount: elements.length,
      elementIds: nextIds,
    });
    const viewStartedAt = performance.now();
    updateSelectionView(elements, { updateAttributes: true });
    traceOperationDuration(config.debugLog, operation, "view", viewStartedAt, {
      elementCount: elements.length,
      elementIds: nextIds,
    });
    endTraceOperation(config.debugLog, operation, {
      elementCount: elements.length,
      elementIds: nextIds,
    });
  }, [config.debugLog, config.selectedIdsRef, markSelectedElements, rebuildObjectTree, resolveElements, updateSelectionView]);

  const refreshSelectionOverlay = useCallback((elementOverride?: SVGElement | SVGElement[] | null): void => {
    const operation = startTraceOperation(config.debugLog, "selection.overlay-refresh");
    const resolveStartedAt = performance.now();
    const elements = resolveElements(elementOverride);
    traceOperationDuration(config.debugLog, operation, "resolve", resolveStartedAt, {
      elementCount: elements.length,
      elementIds: elements.map((element) => element.id),
    });
    const viewStartedAt = performance.now();
    updateSelectionView(elements, { updateAttributes: false });
    traceOperationDuration(config.debugLog, operation, "view", viewStartedAt, {
      elementCount: elements.length,
      elementIds: elements.map((element) => element.id),
    });
    endTraceOperation(config.debugLog, operation, {
      elementCount: elements.length,
      elementIds: elements.map((element) => element.id),
    });
  }, [config.debugLog, resolveElements, updateSelectionView]);

  const setLiveSelectionView = useCallback((
    nextSelected: SelectedElement | null,
    nextSelectionBox?: SelectionBox | null,
    liveElements?: SVGElement[],
  ): void => {
    setSelected(nextSelected);
    if (nextSelectionBox !== undefined) {
      setSelectionBox(nextSelectionBox);
    }
    if (liveElements !== undefined) {
      setSelectedAttributes(liveElements.length === 1 ? visibleAttributes(liveElements[0]) : visibleSharedAttributes(liveElements));
      setSelectedResolvedStyle(liveElements.length === 1 ? resolvedInspectorStyle(liveElements[0]) : null);
      setSelectedInspectorCapabilities(liveElements.length === 1 ? inspectorCapabilities(liveElements[0]) : null);
    }
  }, []);

  const mountSvgSource = useCallback((source: FigureSource): void => {
    const host = config.svgHostRef.current;
    if (!host) {
      return;
    }
    host.innerHTML = "";
    const prepared = prepareSvgForPreview(source.svg, source.figure.id);
    host.appendChild(document.importNode(prepared, true));
    const liveRoot = svgRoot();
    if (liveRoot) {
      ensureSelectableIds(liveRoot);
    }
    rebuildObjectTree(liveRoot);
    const currentSelectionIds = config.selectedIdsRef.current;
    if (currentSelectionIds.length) {
      const nextSelected = currentSelectionIds
        .map((id) => liveRoot?.querySelector<SVGElement>(`#${id}`))
        .filter((node): node is SVGElement => node instanceof SVGElement);
      refreshSelection(nextSelected);
    } else {
      refreshSelection(null);
    }
  }, [config.selectedIdsRef, config.svgHostRef, rebuildObjectTree, refreshSelection, svgRoot]);

  const currentSvgString = useCallback((): string => {
    const root = svgRoot();
    if (!root) {
      throw new Error("SVG preview is not ready.");
    }
    return serializeSvg(root);
  }, [svgRoot]);

  const selectById = useCallback((id: string, options?: { additive?: boolean; toggle?: boolean; rangeIds?: string[] }): void => {
    const root = svgRoot();
    const resolveById = (nodeId: string): SVGElement | null => {
      const found = root?.querySelector<SVGElement>(`#${nodeId}`);
      return found instanceof SVGElement ? found : null;
    };
    const element = resolveById(id);
    const rangeElements = options?.rangeIds
      ?.map((nodeId) => resolveById(nodeId))
      .filter((node): node is SVGElement => node instanceof SVGElement) ?? [];
    if (options?.rangeIds?.length) {
      if (!rangeElements.length) {
        refreshSelection(null);
        return;
      }
      if (options?.additive) {
        const current = selectedElements();
        const currentIds = new Set(current.map((node) => node.id));
        const next = [...current];
        rangeElements.forEach((node) => {
          if (!currentIds.has(node.id)) {
            currentIds.add(node.id);
            next.push(node);
          }
        });
        refreshSelection(next);
        return;
      }
      refreshSelection(rangeElements);
      return;
    }
    if (!(element instanceof SVGElement)) {
      refreshSelection(null);
      return;
    }
    if (options?.toggle) {
      const current = selectedElements();
      const next = current.some((node) => node.id === id)
        ? current.filter((node) => node.id !== id)
        : [...current, element];
      refreshSelection(next);
      return;
    }
    if (options?.additive) {
      const current = selectedElements();
      const next = current.some((node) => node.id === id)
        ? current.filter((node) => node.id !== id)
        : [...current, element];
      refreshSelection(next);
      return;
    }
    refreshSelection(element);
  }, [refreshSelection, svgRoot]);

  useEffect(() => {
    const syncSelection = (): void => refreshSelection();
    window.addEventListener("resize", syncSelection);
    return () => window.removeEventListener("resize", syncSelection);
  }, [refreshSelection]);

  return {
    selected,
    selectedIds,
    selectionBox,
    objectTree,
    selectedAttributes,
    selectedResolvedStyle,
    selectedInspectorCapabilities,
    svgRoot,
    selectedElement,
    selectedElements,
    elementById,
    editableTextNode,
    rebuildObjectTree,
    refreshSelection,
    refreshSelectionOverlay,
    setLiveSelectionView,
    mountSvgSource,
    currentSvgString,
    selectById,
    allSelectableElements: () => {
      const root = svgRoot();
      return root ? allSelectableElements(root) : [];
    },
    setSelected,
    setSelectionBox,
    setObjectTree,
  };
}
