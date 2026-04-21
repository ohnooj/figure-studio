import { useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import {
  buildAlignmentTargets,
  computeAlignmentGuidesFromTargets,
} from "../../shared/lib/svg/alignment";
import { createPrimitiveElement, updatePrimitiveElement } from "../../shared/lib/svg/primitives";
import { clientPointToElementLocal, elementFrame, elementsIntersectingWorldRect, selectedFromElement } from "../../shared/lib/svg/selection";
import { localTransformSnapshot, MIN_ELEMENT_SIZE, resizeElementFromSnapshot, scaleElementFromSnapshot, setElementFrame, setElementPosition, snapshotDescendantTextTransforms } from "../../shared/lib/svg/mutations";
import { svgViewBox } from "../../shared/lib/svg/document";
import {
  elementLocalToWorldMatrix,
  elementScreenToLocalMatrix,
} from "../../shared/lib/svg/transform";
import type { AlignmentGuide, HistorySnapshot, InteractionMode, SelectedElement, ToolMode } from "../../shared/types/editor";

export function useCanvasInteractions(config: {
  activeFigureId: string;
  currentSnapshot: () => HistorySnapshot | null;
  pushHistoryCheckpoint: (figureId: string, snapshot: HistorySnapshot | null, key?: string, force?: boolean) => void;
  toolMode: ToolMode;
  setToolMode: React.Dispatch<React.SetStateAction<ToolMode>>;
  interactionMode: InteractionMode;
  alignmentEnabled: boolean;
  selected: SelectedElement | null;
  viewport: { zoom: number; panX: number; panY: number };
  canvasViewportRef: React.RefObject<HTMLDivElement | null>;
  selectionOverlayRef: React.RefObject<HTMLDivElement | null>;
  svgRoot: () => SVGSVGElement | null;
  selectedElement: () => SVGElement | null;
  selectedElements: () => SVGElement[];
  elementById: (id: string) => SVGElement | null;
  refreshSelection: (element?: SVGElement | SVGElement[] | null, options?: { rebuildTree?: boolean }) => void;
  refreshSelectionOverlay: (element?: SVGElement | SVGElement[] | null) => void;
  setLiveSelectionView: (
    selected: SelectedElement | null,
    selectionBox?: { left: number; top: number; width: number; height: number } | null,
    liveElements?: SVGElement[],
  ) => void;
  figurePointFromClient: (clientX: number, clientY: number) => { x: number; y: number } | null;
  beginTextEdit: (element: SVGElement | null) => void;
  scheduleSave: () => void;
  debugLog: (label: string, payload?: unknown) => void;
}) {
  const [marqueeBox, setMarqueeBox] = useState<null | { left: number; top: number; width: number; height: number }>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const SLOW_OPERATION_MS = 8;

  function trace(label: string, payload?: Record<string, unknown>): void {
    const now = performance.now();
    config.debugLog(label, {
      timestampIso: new Date().toISOString(),
      perfNowMs: Number(now.toFixed(3)),
      ...payload,
    });
  }

  function traceDuration(label: string, startedAt: number, payload?: Record<string, unknown>): void {
    const handlerDurationMs = performance.now() - startedAt;
    const roundedDuration = Number(handlerDurationMs.toFixed(3));
    const eventPayload = {
      timestampIso: new Date().toISOString(),
      perfNowMs: Number(performance.now().toFixed(3)),
      handlerDurationMs: roundedDuration,
      slow: handlerDurationMs >= SLOW_OPERATION_MS,
      ...payload,
    };
    config.debugLog(label, eventPayload);
    if (handlerDurationMs >= SLOW_OPERATION_MS) {
      config.debugLog(`${label}.slow`, eventPayload);
    }
  }

  function debugMatrix(matrix: DOMMatrix | null): Record<string, number> | null {
    if (!matrix) {
      return null;
    }
    return {
      a: Number(matrix.a.toFixed(6)),
      b: Number(matrix.b.toFixed(6)),
      c: Number(matrix.c.toFixed(6)),
      d: Number(matrix.d.toFixed(6)),
      e: Number(matrix.e.toFixed(6)),
      f: Number(matrix.f.toFixed(6)),
    };
  }

  function summarizeElements(elements: SVGElement[]): Array<{ id: string; kind: string; x: number; y: number; width: number; height: number }> {
    return elements.map((element) => {
      const summary = selectedFromElement(element);
      return {
        id: summary.id,
        kind: summary.kind,
        x: summary.x,
        y: summary.y,
        width: summary.width,
        height: summary.height,
      };
    });
  }

  function selectionBoxFromWorldRect(rect: { x: number; y: number; width: number; height: number }): { left: number; top: number; width: number; height: number } {
    return {
      left: config.viewport.panX + rect.x * config.viewport.zoom,
      top: config.viewport.panY + rect.y * config.viewport.zoom,
      width: rect.width * config.viewport.zoom,
      height: rect.height * config.viewport.zoom,
    };
  }

  function rectFromMovedSelection(startRects: Array<{ id: string; rect: SelectedElement }>, dx: number, dy: number): { x: number; y: number; width: number; height: number } {
    const left = Math.min(...startRects.map(({ rect }) => rect.x + dx));
    const top = Math.min(...startRects.map(({ rect }) => rect.y + dy));
    const right = Math.max(...startRects.map(({ rect }) => rect.x + dx + rect.width));
    const bottom = Math.max(...startRects.map(({ rect }) => rect.y + dy + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function syncSelectionOverlay(box: { left: number; top: number; width: number; height: number } | null): boolean {
    const overlay = config.selectionOverlayRef.current;
    if (!overlay || !box) {
      return false;
    }
    overlay.style.left = `${box.left}px`;
    overlay.style.top = `${box.top}px`;
    overlay.style.width = `${box.width}px`;
    overlay.style.height = `${box.height}px`;
    return true;
  }

  function handleCanvasSelect(
    editable: SVGElement | null,
    options?: { additive?: boolean; toggle?: boolean; event?: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement> },
  ): void {
    const event = options?.event;
    trace("direct-manipulation.select", {
      figureId: config.activeFigureId,
      toolMode: config.toolMode,
      editableId: editable?.id ?? null,
      additive: Boolean(options?.additive),
      toggle: Boolean(options?.toggle),
      pointer: event ? { x: event.clientX, y: event.clientY } : null,
    });
    if (config.toolMode !== "select") {
      if (event) {
        startCreateOperation(config.toolMode, event);
      }
      return;
    }
    if (!editable) {
      if (event) {
        startMarqueeSelection(event, Boolean(options?.additive || options?.toggle));
      } else {
        config.refreshSelection(null);
      }
      return;
    }
    if (options?.toggle) {
      const current = config.selectedElements();
      const next = current.some((node) => node.id === editable.id)
        ? current.filter((node) => node.id !== editable.id)
        : [...current, editable];
      config.refreshSelection(next);
      return;
    }
    if (options?.additive) {
      const current = config.selectedElements();
      if (!current.some((node) => node.id === editable.id)) {
        config.refreshSelection([...current, editable]);
      } else {
        config.refreshSelection(current);
      }
      return;
    }
    config.refreshSelection(editable);
  }

  function startMarqueeSelection(event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>, additive: boolean): void {
    const root = config.svgRoot();
    const viewportElement = config.canvasViewportRef.current;
    const startWorld = config.figurePointFromClient(event.clientX, event.clientY);
    if (!root || !viewportElement || !startWorld) {
      config.refreshSelection(null);
      return;
    }
    const baseSelection = additive ? config.selectedElements() : [];
    const viewportRect = viewportElement.getBoundingClientRect();
    const marqueeStartedAt = performance.now();
    let lastInputAt = marqueeStartedAt;
    let inputSeq = 0;
    trace("direct-manipulation.marquee.start", {
      figureId: config.activeFigureId,
      additive,
      startWorld,
      baseSelectionIds: baseSelection.map((node) => node.id),
    });
    const updateMarquee = (clientX: number, clientY: number, phase: "drag" | "end"): void => {
      const currentWorld = config.figurePointFromClient(clientX, clientY);
      if (!currentWorld) {
        return;
      }
      const worldRect = {
        x: Math.min(startWorld.x, currentWorld.x),
        y: Math.min(startWorld.y, currentWorld.y),
        width: Math.abs(currentWorld.x - startWorld.x),
        height: Math.abs(currentWorld.y - startWorld.y),
      };
      const hitTestStartedAt = performance.now();
      const hits = elementsIntersectingWorldRect(root, worldRect);
      traceDuration("direct-manipulation.marquee.hit-test", hitTestStartedAt, {
        figureId: config.activeFigureId,
        additive,
        phase,
        worldRect,
        hitCount: hits.length,
      });
      const combined = additive ? [...baseSelection, ...hits.filter((hit) => !baseSelection.some((node) => node.id === hit.id))] : hits;
      const selectionRefreshStartedAt = performance.now();
      config.refreshSelection(combined);
      traceDuration("direct-manipulation.marquee.selection-refresh", selectionRefreshStartedAt, {
        figureId: config.activeFigureId,
        additive,
        phase,
        selectedIds: combined.map((node) => node.id),
      });
      setMarqueeBox({
        left: Math.min(event.clientX, clientX) - viewportRect.left,
        top: Math.min(event.clientY, clientY) - viewportRect.top,
        width: Math.abs(clientX - event.clientX),
        height: Math.abs(clientY - event.clientY),
      });
    };
    const onMove = (moveEvent: MouseEvent): void => {
      const now = performance.now();
      const eventDeltaMs = now - lastInputAt;
      lastInputAt = now;
      inputSeq += 1;
      trace("direct-manipulation.marquee.input", {
        figureId: config.activeFigureId,
        additive,
        inputSeq,
        gestureElapsedMs: Number((now - marqueeStartedAt).toFixed(3)),
        eventDeltaMs: Number(eventDeltaMs.toFixed(3)),
        effectiveInputFps: eventDeltaMs > 0 ? Number((1000 / eventDeltaMs).toFixed(2)) : null,
        pointerClient: { x: moveEvent.clientX, y: moveEvent.clientY },
      });
      updateMarquee(moveEvent.clientX, moveEvent.clientY, "drag");
    };
    const onUp = (upEvent: MouseEvent): void => {
      const marqueeFinalizeStartedAt = performance.now();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      updateMarquee(upEvent.clientX, upEvent.clientY, "end");
      setMarqueeBox(null);
      if (Math.abs(upEvent.clientX - event.clientX) < 3 && Math.abs(upEvent.clientY - event.clientY) < 3 && !additive) {
        const clearSelectionStartedAt = performance.now();
        config.refreshSelection(null);
        traceDuration("direct-manipulation.marquee.selection-refresh", clearSelectionStartedAt, {
          figureId: config.activeFigureId,
          additive,
          phase: "end",
          selectedIds: [],
          cleared: true,
        });
      }
      traceDuration("direct-manipulation.marquee.end", marqueeFinalizeStartedAt, {
        figureId: config.activeFigureId,
        additive,
        gestureElapsedMs: Number((performance.now() - marqueeStartedAt).toFixed(3)),
        inputEvents: inputSeq,
        pointerEnd: config.figurePointFromClient(upEvent.clientX, upEvent.clientY),
        selectedIds: config.selectedElements().map((node) => node.id),
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startCreateOperation(mode: ToolMode, event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>): void {
    const root = config.svgRoot();
    const start = config.figurePointFromClient(event.clientX, event.clientY);
    if (!root || !start) {
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), `create-${mode}`, true);
    const element = createPrimitiveElement(root, mode, start);
    const gestureStartedAt = performance.now();
    trace("direct-manipulation.create.start", {
      figureId: config.activeFigureId,
      toolMode: mode,
      start,
      elementId: element.id,
    });
    if (mode === "text") {
      config.refreshSelection(element, { rebuildTree: true });
      config.setToolMode("select");
      requestAnimationFrame(() => config.beginTextEdit(element));
      config.scheduleSave();
      traceDuration("direct-manipulation.create.end", gestureStartedAt, {
        figureId: config.activeFigureId,
        toolMode: mode,
        gestureElapsedMs: Number((performance.now() - gestureStartedAt).toFixed(3)),
        element: summarizeElements([element])[0] ?? null,
      });
      return;
    }
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let animationFrameId = 0;
    let previewSeq = 0;
    let lastPreviewAt = gestureStartedAt;
    let lastInputAt = gestureStartedAt;
    let inputSeq = 0;
    const updatePreview = (): void => {
      const previewStartedAt = performance.now();
      animationFrameId = 0;
      const end = config.figurePointFromClient(pendingClientX, pendingClientY);
      if (!end) {
        traceDuration("direct-manipulation.create.preview", previewStartedAt, {
          figureId: config.activeFigureId,
          toolMode: mode,
          previewSeq,
          gestureElapsedMs: Number((performance.now() - gestureStartedAt).toFixed(3)),
          skipped: true,
          reason: "pointer-outside-figure",
        });
        return;
      }
      updatePrimitiveElement(element, mode, start, end);
      const worldRect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
      config.setLiveSelectionView(selectedFromElement(element), selectionBoxFromWorldRect(worldRect), [element]);
      previewSeq += 1;
      const now = performance.now();
      const frameDeltaMs = now - lastPreviewAt;
      lastPreviewAt = now;
      traceDuration("direct-manipulation.create.preview", previewStartedAt, {
        figureId: config.activeFigureId,
        toolMode: mode,
        previewSeq,
        gestureElapsedMs: Number((now - gestureStartedAt).toFixed(3)),
        frameDeltaMs: Number(frameDeltaMs.toFixed(3)),
        effectiveFps: frameDeltaMs > 0 ? Number((1000 / frameDeltaMs).toFixed(2)) : null,
        pointer: end,
        worldRect,
        element: summarizeElements([element])[0] ?? null,
      });
    };
    const schedulePreview = (): void => {
      if (animationFrameId !== 0) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(updatePreview);
    };
    const onMove = (moveEvent: MouseEvent): void => {
      const now = performance.now();
      const eventDeltaMs = now - lastInputAt;
      lastInputAt = now;
      inputSeq += 1;
      trace("direct-manipulation.create.input", {
        figureId: config.activeFigureId,
        toolMode: mode,
        inputSeq,
        gestureElapsedMs: Number((now - gestureStartedAt).toFixed(3)),
        eventDeltaMs: Number(eventDeltaMs.toFixed(3)),
        effectiveInputFps: eventDeltaMs > 0 ? Number((1000 / eventDeltaMs).toFixed(2)) : null,
        pointerClient: { x: moveEvent.clientX, y: moveEvent.clientY },
      });
      pendingClientX = moveEvent.clientX;
      pendingClientY = moveEvent.clientY;
      schedulePreview();
    };
    const onUp = (upEvent: MouseEvent): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      const end = config.figurePointFromClient(upEvent.clientX, upEvent.clientY);
      if (end) {
        updatePrimitiveElement(element, mode, start, end);
      }
      config.refreshSelection(element, { rebuildTree: true });
      config.scheduleSave();
      traceDuration("direct-manipulation.create.end", gestureStartedAt, {
        figureId: config.activeFigureId,
        toolMode: mode,
        end,
        previewFrames: previewSeq,
        inputEvents: inputSeq,
        gestureElapsedMs: Number((performance.now() - gestureStartedAt).toFixed(3)),
        element: summarizeElements([element])[0] ?? null,
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startPointerOperation(mode: "move" | "resize", event: ReactMouseEvent<HTMLDivElement>, handle = "se"): void {
    event.preventDefault();
    const element = config.selectedElement();
    const elements = config.selectedElements();
    const selectedSnapshot = config.selected;
    if (!element || !selectedSnapshot || !elements.length) {
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), `gesture-${mode}`, true);
    const startRects = elements.map((node) => ({ id: node.id, rect: selectedFromElement(node) }));
    const initialX = selectedSnapshot.x;
    const initialY = selectedSnapshot.y;
    const startFrame = elementFrame(element);
    const startInverseMatrix = elementScreenToLocalMatrix(element);
    const startWorldMatrix = elementLocalToWorldMatrix(element);
    const startTransform = localTransformSnapshot(element);
    const startTextTransforms = snapshotDescendantTextTransforms(element);
    const startPointerWorld = config.figurePointFromClient(event.clientX, event.clientY);
    const root = config.svgRoot();
    const artboard = svgViewBox(root);
    const alignmentTargets = mode === "move" && root && config.alignmentEnabled ? buildAlignmentTargets(root, elements, artboard) : null;
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let animationFrameId = 0;
    let previewSeq = 0;
    let lastGuideCount = 0;
    const gestureStartedAt = performance.now();
    let lastPreviewAt = gestureStartedAt;
    let lastInputAt = gestureStartedAt;
    let inputSeq = 0;
    trace("direct-manipulation.gesture.start", {
      figureId: config.activeFigureId,
      mode,
      handle,
      alignmentEnabled: config.alignmentEnabled,
      selected: summarizeElements(elements),
      pointerStart: startPointerWorld,
      interactionMode: config.interactionMode,
      startFrame,
      startTransform: debugMatrix(startTransform),
      startWorldMatrix: debugMatrix(startWorldMatrix),
      startInverseMatrix: debugMatrix(startInverseMatrix),
      textSnapshotCount: startTextTransforms.length,
    });

    function resolveResizeFrame(pointX: number, pointY: number): {
      frame: { x: number; y: number; width: number; height: number };
      clampState: { minWidth: boolean; minHeight: boolean };
      appliedRatio: number | null;
      signedExtent: { x: number; y: number } | null;
    } {
      const minSize = MIN_ELEMENT_SIZE;
      const left = startFrame.x;
      const top = startFrame.y;
      const right = startFrame.x + startFrame.width;
      const bottom = startFrame.y + startFrame.height;

      if (handle === "e") {
        const width = Math.max(minSize, pointX - left);
        return {
          frame: { x: left, y: top, width, height: startFrame.height },
          clampState: { minWidth: width === minSize, minHeight: false },
          appliedRatio: null,
          signedExtent: null,
        };
      }
      if (handle === "s") {
        const height = Math.max(minSize, pointY - top);
        return {
          frame: { x: left, y: top, width: startFrame.width, height },
          clampState: { minWidth: false, minHeight: height === minSize },
          appliedRatio: null,
          signedExtent: null,
        };
      }
      if (handle === "w") {
        const nextX = Math.min(pointX, right - minSize);
        const width = Math.max(minSize, right - nextX);
        return {
          frame: { x: nextX, y: top, width, height: startFrame.height },
          clampState: { minWidth: width === minSize, minHeight: false },
          appliedRatio: null,
          signedExtent: null,
        };
      }
      if (handle === "n") {
        const nextY = Math.min(pointY, bottom - minSize);
        const height = Math.max(minSize, bottom - nextY);
        return {
          frame: { x: left, y: nextY, width: startFrame.width, height },
          clampState: { minWidth: false, minHeight: height === minSize },
          appliedRatio: null,
          signedExtent: null,
        };
      }

      const anchorX = handle.includes("w") ? right : left;
      const anchorY = handle.includes("n") ? bottom : top;
      const widthSign = handle.includes("w") ? -1 : 1;
      const heightSign = handle.includes("n") ? -1 : 1;
      const signedWidthExtent = (pointX - anchorX) * widthSign;
      const signedHeightExtent = (pointY - anchorY) * heightSign;
      const clampedWidthExtent = Math.max(minSize, signedWidthExtent);
      const clampedHeightExtent = Math.max(minSize, signedHeightExtent);
      const ratio = Math.max(
        clampedWidthExtent / Math.max(startFrame.width, minSize),
        clampedHeightExtent / Math.max(startFrame.height, minSize),
      );
      const width = Math.max(minSize, startFrame.width * ratio);
      const height = Math.max(minSize, startFrame.height * ratio);
      const x = widthSign < 0 ? anchorX - width : anchorX;
      const y = heightSign < 0 ? anchorY - height : anchorY;
      return {
        frame: { x, y, width, height },
        clampState: {
          minWidth: clampedWidthExtent === minSize,
          minHeight: clampedHeightExtent === minSize,
        },
        appliedRatio: ratio,
        signedExtent: { x: signedWidthExtent, y: signedHeightExtent },
      };
    }

    const updatePreview = (): void => {
      const previewStartedAt = performance.now();
      animationFrameId = 0;
      if (mode === "move") {
        const currentPointerWorld = config.figurePointFromClient(pendingClientX, pendingClientY);
        if (!startPointerWorld || !currentPointerWorld) {
          traceDuration("direct-manipulation.gesture.preview", previewStartedAt, {
            figureId: config.activeFigureId,
            mode,
            handle,
            previewSeq,
            gestureElapsedMs: Number((performance.now() - gestureStartedAt).toFixed(3)),
            skipped: true,
            reason: "pointer-outside-figure",
          });
          return;
        }
        let dx = currentPointerWorld.x - startPointerWorld.x;
        let dy = currentPointerWorld.y - startPointerWorld.y;
        const proposedRect = new DOMRect(initialX + dx, initialY + dy, selectedSnapshot.width, selectedSnapshot.height);
        if (alignmentTargets) {
          const snap = computeAlignmentGuidesFromTargets(alignmentTargets, proposedRect, 8);
          dx += snap.dx;
          dy += snap.dy;
          setAlignmentGuides(snap.guides);
          lastGuideCount = snap.guides.length;
        } else {
          setAlignmentGuides((current) => (current.length ? [] : current));
          lastGuideCount = 0;
        }
        startRects.forEach(({ id, rect }) => {
          const node = config.elementById(id);
          if (node) {
            setElementPosition(node, rect.x + dx, rect.y + dy);
          }
        });
        const mutationDurationMs = Number((performance.now() - previewStartedAt).toFixed(3));
        const worldRect = rectFromMovedSelection(startRects, dx, dy);
        const overlayStartedAt = performance.now();
        const overlayBox = selectionBoxFromWorldRect(worldRect);
        const overlayUpdated = syncSelectionOverlay(overlayBox);
        const nextSelected = elements.length > 1
          ? {
              ...selectedSnapshot,
              x: worldRect.x,
              y: worldRect.y,
              width: worldRect.width,
              height: worldRect.height,
            }
          : {
              ...selectedSnapshot,
              x: startRects[0].rect.x + dx,
              y: startRects[0].rect.y + dy,
            };
        const liveElements = startRects
          .map(({ id }) => config.elementById(id))
          .filter((node): node is SVGElement => Boolean(node));
        config.setLiveSelectionView(nextSelected, overlayUpdated ? undefined : overlayBox, liveElements);
        const overlayDurationMs = Number((performance.now() - overlayStartedAt).toFixed(3));
        previewSeq += 1;
        const now = performance.now();
        const frameDeltaMs = now - lastPreviewAt;
        lastPreviewAt = now;
        traceDuration("direct-manipulation.gesture.preview", previewStartedAt, {
          figureId: config.activeFigureId,
          mode,
          handle,
          previewSeq,
          gestureElapsedMs: Number((now - gestureStartedAt).toFixed(3)),
          frameDeltaMs: Number(frameDeltaMs.toFixed(3)),
          effectiveFps: frameDeltaMs > 0 ? Number((1000 / frameDeltaMs).toFixed(2)) : null,
          dx,
          dy,
          pointer: currentPointerWorld,
          worldRect,
          guideCount: lastGuideCount,
          mutationDurationMs,
          overlayDurationMs,
          overlayUpdateMode: overlayUpdated ? "imperative" : "react-fallback",
        });
      } else if (selectedSnapshot.canResize) {
        const point = clientPointToElementLocal(element, pendingClientX, pendingClientY, startInverseMatrix ?? undefined);
        if (!point) {
          traceDuration("direct-manipulation.gesture.preview", previewStartedAt, {
            figureId: config.activeFigureId,
            mode,
            handle,
            previewSeq,
            gestureElapsedMs: Number((performance.now() - gestureStartedAt).toFixed(3)),
            skipped: true,
            reason: "local-point-miss",
          });
          return;
        }
        const { frame, clampState, appliedRatio, signedExtent } = resolveResizeFrame(point.x, point.y);
        const desiredWorldTopLeft = new DOMPoint(frame.x, frame.y).matrixTransform(startWorldMatrix);
        const fallbackWorldRect = {
          x: desiredWorldTopLeft.x,
          y: desiredWorldTopLeft.y,
          width: frame.width,
          height: frame.height,
        };
        const scaleDebug = config.interactionMode === "scale" && selectedSnapshot.canScale
          ? scaleElementFromSnapshot(element, startTransform, startFrame, frame, startTextTransforms)
          : null;
        const resizeDebug = config.interactionMode === "scale"
          ? null
          : selectedSnapshot.canScale
            ? resizeElementFromSnapshot(element, startTransform, startFrame, frame, startTextTransforms)
            : setElementFrame(element, desiredWorldTopLeft.x, desiredWorldTopLeft.y, frame.width, frame.height);
        const worldRect = scaleDebug?.afterWorld ?? resizeDebug?.afterWorld ?? fallbackWorldRect;
        const mutationDurationMs = Number((performance.now() - previewStartedAt).toFixed(3));
        const overlayStartedAt = performance.now();
        const overlayBox = selectionBoxFromWorldRect(worldRect);
        const overlayUpdated = syncSelectionOverlay(overlayBox);
        config.setLiveSelectionView(
          {
            ...selectedSnapshot,
            x: worldRect.x,
            y: worldRect.y,
            width: worldRect.width,
            height: worldRect.height,
          },
          overlayUpdated ? undefined : overlayBox,
          [element],
        );
        const overlayDurationMs = Number((performance.now() - overlayStartedAt).toFixed(3));
        previewSeq += 1;
        const now = performance.now();
        const frameDeltaMs = now - lastPreviewAt;
        lastPreviewAt = now;
        traceDuration("direct-manipulation.gesture.preview", previewStartedAt, {
          figureId: config.activeFigureId,
          mode,
          handle,
          previewSeq,
          gestureElapsedMs: Number((now - gestureStartedAt).toFixed(3)),
          frameDeltaMs: Number(frameDeltaMs.toFixed(3)),
          effectiveFps: frameDeltaMs > 0 ? Number((1000 / frameDeltaMs).toFixed(2)) : null,
          pointer: { x: pendingClientX, y: pendingClientY },
          localPoint: {
            x: Number(point.x.toFixed(6)),
            y: Number(point.y.toFixed(6)),
          },
          localFrame: {
            x: Number(frame.x.toFixed(6)),
            y: Number(frame.y.toFixed(6)),
            width: Number(frame.width.toFixed(6)),
            height: Number(frame.height.toFixed(6)),
          },
          startFrame,
          desiredWorldTopLeft: {
            x: Number(desiredWorldTopLeft.x.toFixed(6)),
            y: Number(desiredWorldTopLeft.y.toFixed(6)),
          },
          worldRect,
          interactionMode: config.interactionMode,
          clampState,
          appliedRatio,
          signedExtent,
          startTransform: debugMatrix(startTransform),
          startWorldMatrix: debugMatrix(startWorldMatrix),
          currentLocalTransform: debugMatrix(localTransformSnapshot(element)),
          currentWorldMatrix: debugMatrix(elementLocalToWorldMatrix(element)),
          resizeDebug,
          scaleDebug,
          mutationDurationMs,
          overlayDurationMs,
          overlayUpdateMode: overlayUpdated ? "imperative" : "react-fallback",
        });
        if (!config.alignmentEnabled) {
          setAlignmentGuides((current) => (current.length ? [] : current));
          lastGuideCount = 0;
        }
      }
    };
    const schedulePreview = (): void => {
      if (animationFrameId !== 0) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(updatePreview);
    };
    const onMove = (moveEvent: MouseEvent): void => {
      const now = performance.now();
      const eventDeltaMs = now - lastInputAt;
      lastInputAt = now;
      inputSeq += 1;
      trace("direct-manipulation.gesture.input", {
        figureId: config.activeFigureId,
        mode,
        handle,
        inputSeq,
        gestureElapsedMs: Number((now - gestureStartedAt).toFixed(3)),
        eventDeltaMs: Number(eventDeltaMs.toFixed(3)),
        effectiveInputFps: eventDeltaMs > 0 ? Number((1000 / eventDeltaMs).toFixed(2)) : null,
        pointerClient: { x: moveEvent.clientX, y: moveEvent.clientY },
      });
      pendingClientX = moveEvent.clientX;
      pendingClientY = moveEvent.clientY;
      schedulePreview();
    };

    const onUp = (upEvent: MouseEvent): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      pendingClientX = upEvent.clientX;
      pendingClientY = upEvent.clientY;
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      updatePreview();
      setAlignmentGuides((current) => (current.length ? [] : current));
      const committedElements = elements.length > 1
        ? elements.map((node) => config.elementById(node.id)).filter((node): node is SVGElement => Boolean(node))
        : [config.elementById(element.id) ?? element];
      const commitStartedAt = performance.now();
      config.refreshSelection(
        elements.length > 1 ? committedElements : committedElements[0] ?? element,
      );
      config.scheduleSave();
      traceDuration("direct-manipulation.gesture.commit", commitStartedAt, {
        figureId: config.activeFigureId,
        mode,
        handle,
        previewFrames: previewSeq,
        inputEvents: inputSeq,
        pointerEnd: config.figurePointFromClient(upEvent.clientX, upEvent.clientY),
        committed: summarizeElements(committedElements),
        committedLocalFrame: elementFrame(element),
        committedWorldRect: selectedFromElement(element),
      });
      trace("direct-manipulation.gesture.end", {
        figureId: config.activeFigureId,
        mode,
        handle,
        previewFrames: previewSeq,
        inputEvents: inputSeq,
        gestureElapsedMs: Number((performance.now() - gestureStartedAt).toFixed(3)),
        pointerEnd: config.figurePointFromClient(upEvent.clientX, upEvent.clientY),
        committed: summarizeElements(committedElements),
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return {
    marqueeBox,
    alignmentGuides,
    handleCanvasSelect,
    startPointerOperation,
  };
}
