import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";
import { endTraceOperation, startTraceOperation, traceOperationDuration, traceOperationEvent } from "../../shared/lib/trace";
import { clamp } from "../../shared/lib/utils";
import { svgViewBox } from "../../shared/lib/svg/document";
import type { ViewportState } from "../../shared/types/editor";

export function useViewportState(
  canvasViewportRef: React.RefObject<HTMLDivElement | null>,
  onDebugLog?: (label: string, payload?: unknown) => void,
) {
  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 0.6,
    panX: 40,
    panY: 40,
    artboardWidth: 1400,
    artboardHeight: 860,
  });
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const spacePressedRef = useRef(false);

  const fitViewport = useCallback((rootOverride?: SVGSVGElement | null): void => {
    const operation = startTraceOperation(onDebugLog, "viewport.fit");
    const root = rootOverride ?? null;
    const viewportElement = canvasViewportRef.current;
    if (!root || !viewportElement) {
      endTraceOperation(onDebugLog, operation, { skipped: true });
      return;
    }
    const applyStartedAt = performance.now();
    const artboard = svgViewBox(root);
    const width = Math.max(viewportElement.clientWidth - 48, 100);
    const height = Math.max(viewportElement.clientHeight - 48, 100);
    const zoom = Math.min(width / artboard.width, height / artboard.height);
    setViewport({
      zoom,
      panX: (viewportElement.clientWidth - artboard.width * zoom) / 2,
      panY: (viewportElement.clientHeight - artboard.height * zoom) / 2,
      artboardWidth: artboard.width,
      artboardHeight: artboard.height,
    });
    traceOperationDuration(onDebugLog, operation, "apply", applyStartedAt, {
      artboardWidth: artboard.width,
      artboardHeight: artboard.height,
      zoom,
    });
    endTraceOperation(onDebugLog, operation, {
      artboardWidth: artboard.width,
      artboardHeight: artboard.height,
      zoom,
    });
  }, [canvasViewportRef]);

  const figurePointFromClient = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const viewportElement = canvasViewportRef.current;
    if (!viewportElement) {
      return null;
    }
    const rect = viewportElement.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.panX) / viewport.zoom,
      y: (clientY - rect.top - viewport.panY) / viewport.zoom,
    };
  }, [canvasViewportRef, viewport.panX, viewport.panY, viewport.zoom]);

  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    const operation = startTraceOperation(onDebugLog, event.shiftKey ? "viewport.wheel-pan" : "viewport.zoom");
    const applyStartedAt = performance.now();
    event.preventDefault();
    if (event.shiftKey) {
      setViewport((current) => ({
        ...current,
        panX: current.panX - event.deltaY,
        panY: current.panY - event.deltaX,
      }));
      traceOperationDuration(onDebugLog, operation, "apply", applyStartedAt, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
      endTraceOperation(onDebugLog, operation, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
      return;
    }
    const viewportElement = canvasViewportRef.current;
    const rect = viewportElement?.getBoundingClientRect();
    const point = figurePointFromClient(event.clientX, event.clientY);
    const intensity = Math.abs(event.deltaY) > 32 ? 1.12 : 1.06;
    const nextZoom = clamp(viewport.zoom * (event.deltaY < 0 ? intensity : 1 / intensity), 0.1, 8);
    if (!point) {
      setViewport((current) => ({ ...current, zoom: nextZoom }));
      traceOperationDuration(onDebugLog, operation, "apply", applyStartedAt, { zoom: nextZoom, point: null });
      endTraceOperation(onDebugLog, operation, { zoom: nextZoom, point: null });
      return;
    }
    setViewport((current) => ({
      ...current,
      zoom: nextZoom,
      panX: event.clientX - (point.x * nextZoom + (rect?.left ?? 0)),
      panY: event.clientY - (point.y * nextZoom + (rect?.top ?? 0)),
    }));
    traceOperationDuration(onDebugLog, operation, "apply", applyStartedAt, {
      zoom: nextZoom,
      point,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    endTraceOperation(onDebugLog, operation, {
      zoom: nextZoom,
      point,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  function handleViewportPointerDown(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!(spacePressedRef.current || event.button === 1)) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialPanX = viewport.panX;
    const initialPanY = viewport.panY;
    const operation = startTraceOperation(onDebugLog, "viewport.pan", {
      startX,
      startY,
      initialPanX,
      initialPanY,
    });
    let lastPanX = initialPanX;
    let lastPanY = initialPanY;
    let lastMoveAt = performance.now();
    let moveCount = 0;
    const onMove = (moveEvent: MouseEvent): void => {
      const moveStartedAt = performance.now();
      lastPanX = initialPanX + (moveEvent.clientX - startX);
      lastPanY = initialPanY + (moveEvent.clientY - startY);
      setViewport((current) => ({
        ...current,
        panX: lastPanX,
        panY: lastPanY,
      }));
      moveCount += 1;
      const now = performance.now();
      traceOperationDuration(onDebugLog, operation, "move", moveStartedAt, {
        moveCount,
        eventDeltaMs: Number((now - lastMoveAt).toFixed(3)),
        effectiveInputFps: now > lastMoveAt ? Number((1000 / (now - lastMoveAt)).toFixed(2)) : null,
        panX: lastPanX,
        panY: lastPanY,
      });
      lastMoveAt = now;
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      traceOperationEvent(onDebugLog, operation, "summary", {
        startX,
        startY,
        endPanX: lastPanX,
        endPanY: lastPanY,
        moveCount,
      });
      endTraceOperation(onDebugLog, operation, {
        startX,
        startY,
        endPanX: lastPanX,
        endPanY: lastPanY,
        moveCount,
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const rulerMarks = useMemo(() => {
    const step = 100;
    const marks: number[] = [];
    for (let value = 0; value <= Math.max(viewport.artboardWidth, viewport.artboardHeight); value += step) {
      marks.push(value);
    }
    return marks;
  }, [viewport.artboardWidth, viewport.artboardHeight]);

  return {
    viewport,
    setViewport,
    cursorPoint,
    setCursorPoint,
    spacePressedRef,
    fitViewport,
    figurePointFromClient,
    handleViewportWheel,
    handleViewportPointerDown,
    rulerMarks,
  };
}
