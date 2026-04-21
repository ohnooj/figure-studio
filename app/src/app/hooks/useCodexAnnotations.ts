import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { buildFigureContext, nextCodexHighlightColor } from "../../features/codex/codexContext";
import type {
  CodexAnnotation,
  CodexAnnotationTool,
  CodexFigureContext,
  CodexSelectedObjectSummary,
  FigureSource,
  HistorySnapshot,
} from "../../shared/types/editor";

const DEFAULT_CODEX_ANNOTATION_COLOR = "#ff8a1f";
const CODEX_SESSION_STORAGE_KEY = "paper_figures.codexSession.v1";

type FigureCodexState = {
  annotations: CodexAnnotation[];
  selectedId: string;
  tool: CodexAnnotationTool;
  color: string;
};

type Point = { x: number; y: number };

function pointInExpandedRect(point: Point, start: Point, end: Point, padding = 10): boolean {
  const left = Math.min(start.x, end.x) - padding;
  const top = Math.min(start.y, end.y) - padding;
  const right = Math.max(start.x, end.x) + padding;
  const bottom = Math.max(start.y, end.y) + padding;
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function hitTestAnnotation(point: Point, annotations: CodexAnnotation[]): CodexAnnotation | null {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if ((annotation.kind === "highlight" || annotation.kind === "selection") && annotation.points.length >= 2) {
      if (pointInExpandedRect(point, annotation.points[0], annotation.points[1])) {
        return annotation;
      }
      continue;
    }
    if (annotation.kind === "arrow" && annotation.points.length >= 2) {
      if (distanceToSegment(point, annotation.points[0], annotation.points[1]) <= 10) {
        return annotation;
      }
      continue;
    }
    if (annotation.kind === "freehand" && annotation.points.length >= 2) {
      for (let segmentIndex = 1; segmentIndex < annotation.points.length; segmentIndex += 1) {
        if (distanceToSegment(point, annotation.points[segmentIndex - 1], annotation.points[segmentIndex]) <= 10) {
          return annotation;
        }
      }
    }
  }
  return null;
}

function cloneAnnotation(annotation: CodexAnnotation): CodexAnnotation {
  return {
    ...annotation,
    points: annotation.points.map((point) => ({ ...point })),
    selectedIds: annotation.selectedIds ? [...annotation.selectedIds] : undefined,
  };
}

function cloneAnnotations(annotations: CodexAnnotation[]): CodexAnnotation[] {
  return annotations.map(cloneAnnotation);
}

function defaultFigureCodexState(): FigureCodexState {
  return {
    annotations: [],
    selectedId: "",
    tool: "select",
    color: DEFAULT_CODEX_ANNOTATION_COLOR,
  };
}

function parseStoredFigureState(value: unknown): FigureCodexState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const annotations = Array.isArray(record.annotations)
    ? record.annotations.filter((annotation): annotation is CodexAnnotation => Boolean(annotation && typeof annotation === "object")).map(cloneAnnotation)
    : [];
  return {
    annotations,
    selectedId: typeof record.selectedId === "string" ? record.selectedId : "",
    tool: record.tool === "highlight" || record.tool === "arrow" || record.tool === "freehand" || record.tool === "select"
      ? record.tool
      : "select",
    color: typeof record.color === "string" ? record.color : DEFAULT_CODEX_ANNOTATION_COLOR,
  };
}

export function useCodexAnnotations(config: {
  activeFigureId: string;
  activeSource: FigureSource | null;
  selectedObjectSummaries: CodexSelectedObjectSummary[];
  figurePointFromClient: (clientX: number, clientY: number) => { x: number; y: number } | null;
  currentEditorSnapshot: () => Omit<HistorySnapshot, "codex"> | null;
  pushHistoryCheckpoint: (figureId: string, snapshot: HistorySnapshot | null, key?: string, force?: boolean) => void;
}) {
  const [codexAnnotations, setCodexAnnotations] = useState<CodexAnnotation[]>([]);
  const [selectedCodexAnnotationId, setSelectedCodexAnnotationId] = useState("");
  const [hoveredCodexAnnotationId, setHoveredCodexAnnotationId] = useState("");
  const [codexAnnotationTool, setCodexAnnotationTool] = useState<CodexAnnotationTool>("select");
  const [codexAnnotationColor, setCodexAnnotationColor] = useState(DEFAULT_CODEX_ANNOTATION_COLOR);
  const figureStatesRef = useRef<Record<string, FigureCodexState>>({});
  const currentFigureIdRef = useRef(config.activeFigureId);
  const codexAnnotationsRef = useRef<CodexAnnotation[]>([]);
  const codexDrawingRef = useRef<{
    id: string;
    kind: CodexAnnotation["kind"];
    color: string;
    start: { x: number; y: number };
    created: boolean;
  } | null>(null);
  const codexMoveRef = useRef<{
    id: string;
    start: Point;
    originPoints: Point[];
    moved: boolean;
    historyPushed: boolean;
  } | null>(null);

  useEffect(() => {
    const savedSession = window.localStorage.getItem(CODEX_SESSION_STORAGE_KEY);
    if (!savedSession) {
      return;
    }
    try {
      const parsed = JSON.parse(savedSession) as { figures?: Record<string, unknown> };
      const nextFigureStates: Record<string, FigureCodexState> = {};
      Object.entries(parsed.figures ?? {}).forEach(([figureId, state]) => {
        const parsedState = parseStoredFigureState(state);
        if (parsedState) {
          nextFigureStates[figureId] = parsedState;
        }
      });
      figureStatesRef.current = nextFigureStates;
    } catch {
      window.localStorage.removeItem(CODEX_SESSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    codexAnnotationsRef.current = codexAnnotations;
  }, [codexAnnotations]);

  useEffect(() => {
    const figureId = currentFigureIdRef.current;
    if (!figureId) {
      return;
    }
    figureStatesRef.current[figureId] = {
      annotations: cloneAnnotations(codexAnnotations),
      selectedId: selectedCodexAnnotationId,
      tool: codexAnnotationTool,
      color: codexAnnotationColor,
    };
    window.localStorage.setItem(CODEX_SESSION_STORAGE_KEY, JSON.stringify({ figures: figureStatesRef.current }));
  }, [codexAnnotations, codexAnnotationColor, codexAnnotationTool, selectedCodexAnnotationId]);

  useEffect(() => {
    const nextState = config.activeFigureId
      ? (figureStatesRef.current[config.activeFigureId] ?? defaultFigureCodexState())
      : defaultFigureCodexState();
    currentFigureIdRef.current = config.activeFigureId;
    setCodexAnnotations(cloneAnnotations(nextState.annotations));
    setSelectedCodexAnnotationId(nextState.selectedId);
    setHoveredCodexAnnotationId("");
    setCodexAnnotationTool(nextState.tool);
    setCodexAnnotationColor(nextState.color);
    codexDrawingRef.current = null;
  }, [config.activeFigureId]);

  function persistFigureState(overrides?: Partial<FigureCodexState>): void {
    const figureId = currentFigureIdRef.current;
    if (!figureId) {
      return;
    }
    figureStatesRef.current[figureId] = {
      annotations: cloneAnnotations(overrides?.annotations ?? codexAnnotations),
      selectedId: overrides?.selectedId ?? selectedCodexAnnotationId,
      tool: overrides?.tool ?? codexAnnotationTool,
      color: overrides?.color ?? codexAnnotationColor,
    };
    window.localStorage.setItem(CODEX_SESSION_STORAGE_KEY, JSON.stringify({ figures: figureStatesRef.current }));
  }

  function pushCodexHistoryCheckpoint(key: string, force = true): void {
    if (!config.activeFigureId) {
      return;
    }
    const editorSnapshot = config.currentEditorSnapshot();
    if (!editorSnapshot) {
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, { ...editorSnapshot, codex: codexSnapshot() }, key, force);
  }

  function commitAnnotationChange(nextAnnotations: CodexAnnotation[], nextSelectedId: string): void {
    persistFigureState({
      annotations: nextAnnotations,
      selectedId: nextSelectedId,
    });
    setCodexAnnotations(nextAnnotations);
    setSelectedCodexAnnotationId(nextSelectedId);
  }

  function codexSnapshot(): HistorySnapshot["codex"] {
    return {
      annotations: cloneAnnotations(codexAnnotationsRef.current),
      selectedId: selectedCodexAnnotationId,
      tool: codexAnnotationTool,
      color: codexAnnotationColor,
    };
  }

  function restoreCodexSnapshot(snapshot: HistorySnapshot["codex"]): void {
    const restored = {
      annotations: cloneAnnotations(snapshot.annotations),
      selectedId: snapshot.selectedId,
      tool: snapshot.tool,
      color: snapshot.color,
    };
    codexDrawingRef.current = null;
    codexMoveRef.current = null;
    setCodexAnnotations(restored.annotations);
    setSelectedCodexAnnotationId(restored.selectedId);
    setHoveredCodexAnnotationId("");
    setCodexAnnotationTool(restored.tool);
    setCodexAnnotationColor(restored.color);
    persistFigureState(restored);
  }

  const codexFigureContext: CodexFigureContext | null = useMemo(() => (
    config.activeSource
      ? buildFigureContext(config.activeSource, config.selectedObjectSummaries, codexAnnotations)
      : null
  ), [config.activeSource, config.selectedObjectSummaries, codexAnnotations]);

  function handleCodexCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>): boolean {
    const point = config.figurePointFromClient(event.clientX, event.clientY);
    if (!point) {
      return false;
    }
    if (codexAnnotationTool === "select") {
      const hit = hitTestAnnotation(point, codexAnnotationsRef.current);
      setHoveredCodexAnnotationId(hit?.id ?? "");
      if (!hit) {
        return false;
      }
      codexMoveRef.current = {
        id: hit.id,
        start: point,
        originPoints: hit.points.map((item) => ({ ...item })),
        moved: false,
        historyPushed: false,
      };
      setSelectedCodexAnnotationId(hit.id);
      return true;
    }
    const kind = codexAnnotationTool === "highlight" ? "highlight" : codexAnnotationTool === "arrow" ? "arrow" : "freehand";
    codexDrawingRef.current = {
      id: `annotation-${Date.now()}`,
      kind,
      color: kind === "highlight" ? nextCodexHighlightColor(codexAnnotations) : codexAnnotationColor,
      start: point,
      created: false,
    };
    return true;
  }

  function handleCodexCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const point = config.figurePointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    if (codexAnnotationTool === "select") {
      const activeMove = codexMoveRef.current;
      if (!activeMove) {
        setHoveredCodexAnnotationId(hitTestAnnotation(point, codexAnnotationsRef.current)?.id ?? "");
        return;
      }
      const deltaX = point.x - activeMove.start.x;
      const deltaY = point.y - activeMove.start.y;
      if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
        activeMove.moved = true;
        if (!activeMove.historyPushed) {
          pushCodexHistoryCheckpoint("codex-move");
          activeMove.historyPushed = true;
        }
      }
      setCodexAnnotations((current) =>
        current.map((annotation) => (
          annotation.id !== activeMove.id
            ? annotation
            : {
                ...annotation,
                points: activeMove.originPoints.map((originPoint) => ({
                  x: originPoint.x + deltaX,
                  y: originPoint.y + deltaY,
                })),
              }
        )),
      );
      return;
    }
    if (!codexDrawingRef.current) {
      return;
    }
    const draft = codexDrawingRef.current;
    if (!draft.created) {
      const deltaX = point.x - draft.start.x;
      const deltaY = point.y - draft.start.y;
      if (Math.hypot(deltaX, deltaY) < 6) {
        return;
      }
      draft.created = true;
      pushCodexHistoryCheckpoint("codex-draw");
      commitAnnotationChange([
        ...codexAnnotations,
        {
          id: draft.id,
          kind: draft.kind,
          color: draft.color,
          points: [draft.start, point],
        },
      ], draft.id);
      return;
    }
    setCodexAnnotations((current) =>
      current.map((annotation) => {
        if (annotation.id !== draft.id) {
          return annotation;
        }
        if (annotation.kind === "freehand") {
          return { ...annotation, points: [...annotation.points, point] };
        }
        return { ...annotation, points: [annotation.points[0] ?? point, point] };
      }),
    );
  }

  function handleCodexCanvasPointerUp(_event?: ReactPointerEvent<HTMLDivElement>): void {
    const activeMove = codexMoveRef.current;
    if (activeMove) {
      if (activeMove.moved) {
        persistFigureState({
          annotations: codexAnnotationsRef.current,
          selectedId: activeMove.id,
        });
      }
      codexMoveRef.current = null;
    }
    setHoveredCodexAnnotationId("");
    codexDrawingRef.current = null;
  }

  function deleteCodexAnnotation(annotationId: string): void {
    pushCodexHistoryCheckpoint("codex-delete");
    const nextAnnotations = codexAnnotations.filter((annotation) => annotation.id !== annotationId);
    commitAnnotationChange(nextAnnotations, selectedCodexAnnotationId === annotationId ? "" : selectedCodexAnnotationId);
  }

  function clearCodexAnnotations(): void {
    pushCodexHistoryCheckpoint("codex-clear");
    commitAnnotationChange([], "");
  }

  function addSelectionAnnotation(): void {
    if (!config.selectedObjectSummaries.length) {
      return;
    }
    pushCodexHistoryCheckpoint("codex-selection");
    const left = Math.min(...config.selectedObjectSummaries.map((item) => item.x));
    const top = Math.min(...config.selectedObjectSummaries.map((item) => item.y));
    const right = Math.max(...config.selectedObjectSummaries.map((item) => item.x + item.width));
    const bottom = Math.max(...config.selectedObjectSummaries.map((item) => item.y + item.height));
    const nextId = `annotation-${Date.now()}`;
    commitAnnotationChange(
      [
        ...codexAnnotations,
        {
          id: nextId,
          kind: "selection",
          color: codexAnnotationColor,
          points: [{ x: left, y: top }, { x: right, y: bottom }],
          selectedIds: config.selectedObjectSummaries.map((item) => item.id),
        },
      ],
      nextId,
    );
  }

  function deleteSelectedCodexAnnotation(): void {
    if (!selectedCodexAnnotationId) {
      return;
    }
    deleteCodexAnnotation(selectedCodexAnnotationId);
  }

  function selectAllCodexAnnotations(): void {
    setSelectedCodexAnnotationId(codexAnnotations[codexAnnotations.length - 1]?.id ?? "");
  }

  function copySelectedCodexAnnotation(): void {
    if (!selectedCodexAnnotationId) {
      return;
    }
    const selectedAnnotation = codexAnnotations.find((annotation) => annotation.id === selectedCodexAnnotationId);
    if (!selectedAnnotation) {
      return;
    }
    pushCodexHistoryCheckpoint("codex-copy");
    const nextId = `annotation-${Date.now()}`;
    const duplicated: CodexAnnotation = {
      ...selectedAnnotation,
      id: nextId,
      points: selectedAnnotation.points.map((point) => ({ x: point.x + 16, y: point.y + 16 })),
      selectedIds: selectedAnnotation.selectedIds ? [...selectedAnnotation.selectedIds] : undefined,
    };
    persistFigureState({
      annotations: [...codexAnnotations, duplicated],
      selectedId: nextId,
    });
    setCodexAnnotations([...codexAnnotations, duplicated]);
    setSelectedCodexAnnotationId(nextId);
  }

  return {
    codexAnnotations,
    selectedCodexAnnotationId,
    setSelectedCodexAnnotationId,
    hoveredCodexAnnotationId,
    setHoveredCodexAnnotationId,
    codexAnnotationTool,
    setCodexAnnotationTool,
    codexAnnotationColor,
    setCodexAnnotationColor,
    codexFigureContext,
    handleCodexCanvasPointerDown,
    handleCodexCanvasPointerMove,
    handleCodexCanvasPointerUp,
    addSelectionAnnotation,
    deleteCodexAnnotation,
    deleteSelectedCodexAnnotation,
    clearCodexAnnotations,
    selectAllCodexAnnotations,
    copySelectedCodexAnnotation,
    codexSnapshot,
    restoreCodexSnapshot,
  };
}
