import { useEffect, useMemo, useRef, useState } from "react";

import { buildObjectTree } from "../../shared/lib/svg/tree";
import type { CodexAnnotation, CodexAnnotationTool, CodexRun, CodexRunVariant, ObjectNode } from "../../shared/types/editor";
import { CODEX_PROMPT_REFERENCE_MIME, serializePromptReferenceToken, type PromptReferenceToken } from "./promptTokens";

const GALLERY_STORAGE_KEY = "paper_figures.codexGalleryWorkspace.v1";
const GALLERY_CARD_WIDTH = 360;
const GALLERY_FRAME_WIDTH = 320;
const GALLERY_FRAME_HEIGHT = 220;
const GALLERY_CARD_HEIGHT = 324;
const GALLERY_GAP = 28;

type GalleryCard = {
  id: string;
  label: string;
  svg: string;
  variant: CodexRunVariant | null;
  reviewState: "before" | "pending" | "applied" | "rejected";
  statusLabel: string;
};

type GalleryViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

type GalleryWorkspaceState = {
  focusedCardId: string;
  viewport: GalleryViewport;
  annotationsByCard: Record<string, CodexAnnotation[]>;
};

type GalleryAnnotationSelection = {
  cardId: string;
  annotationId: string;
};

type Point = { x: number; y: number };

export function galleryCardsForRun(run: CodexRun): GalleryCard[] {
  const cards: GalleryCard[] = [];
  if (run.figureContext.svg?.includes("<svg")) {
    cards.push({
      id: "before",
      label: "Before",
      svg: run.figureContext.svg,
      variant: null,
      reviewState: "before",
      statusLabel: "Original",
    });
  }
  run.variants.forEach((variant) => {
    if (!variant.latestPreviewSvg?.includes("<svg")) {
      return;
    }
    cards.push({
      id: variant.id,
      label: variant.label,
      svg: variant.latestPreviewSvg,
      variant,
      reviewState: variant.reviewState,
      statusLabel: variant.reviewState === "pending" ? (variant.currentStatus || variant.state) : variant.reviewState,
    });
  });
  return cards;
}

export function buildGalleryCardTree(card: GalleryCard | null): ObjectNode[] {
  if (!card?.svg?.includes("<svg")) {
    return [];
  }
  const documentRef = new DOMParser().parseFromString(card.svg, "image/svg+xml");
  const root = documentRef.querySelector("svg");
  return root instanceof SVGSVGElement ? buildObjectTree(root) : [];
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function defaultWorkspace(cards: GalleryCard[]): GalleryWorkspaceState {
  return {
    focusedCardId: cards[0]?.id ?? "",
    viewport: { zoom: 1, panX: 36, panY: 36 },
    annotationsByCard: {},
  };
}

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

function cloneAnnotationsByCard(annotationsByCard: Record<string, CodexAnnotation[]>): Record<string, CodexAnnotation[]> {
  return Object.fromEntries(
    Object.entries(annotationsByCard).map(([cardId, annotations]) => [
      cardId,
      annotations.map((annotation) => ({
        ...annotation,
        points: annotation.points.map((point) => ({ ...point })),
        selectedIds: annotation.selectedIds ? [...annotation.selectedIds] : undefined,
      })),
    ]),
  );
}

function dispatchGalleryAction(detail: {
  action: "apply" | "reject" | "mark";
  runId: string;
  variantId?: string;
}): void {
  window.dispatchEvent(new CustomEvent("paper_figures:codex_gallery_action", { detail }));
}

export function CodexCanvasGallery(props: {
  run: CodexRun;
  annotationTool: CodexAnnotationTool;
  annotationColor: string;
  onClose: () => void;
  onFocusCard: (cardId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cards = useMemo(() => galleryCardsForRun(props.run), [props.run]);
  const [workspace, setWorkspace] = useState<GalleryWorkspaceState>(() => defaultWorkspace(cards));
  const [selectedAnnotation, setSelectedAnnotation] = useState<GalleryAnnotationSelection | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<GalleryAnnotationSelection | null>(null);
  const drawingRef = useRef<{
    cardId: string;
    id: string;
    kind: CodexAnnotation["kind"];
    color: string;
    start: Point;
    created: boolean;
  } | null>(null);
  const moveRef = useRef<{
    cardId: string;
    annotationId: string;
    start: Point;
    originPoints: Point[];
  } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const columns = Math.max(1, Math.ceil(Math.sqrt(cards.length || 1)));
  const surfaceWidth = columns * GALLERY_CARD_WIDTH + Math.max(0, columns - 1) * GALLERY_GAP + 72;
  const rows = Math.max(1, Math.ceil((cards.length || 1) / columns));
  const surfaceHeight = rows * GALLERY_CARD_HEIGHT + Math.max(0, rows - 1) * GALLERY_GAP + 72;
  const cardFrames = useMemo(() => (
    cards.map((card, index) => ({
      card,
      left: 36 + (index % columns) * (GALLERY_CARD_WIDTH + GALLERY_GAP),
      top: 36 + Math.floor(index / columns) * (GALLERY_CARD_HEIGHT + GALLERY_GAP),
    }))
  ), [cards, columns]);

  useEffect(() => {
    const raw = window.localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) {
      const next = defaultWorkspace(cards);
      setWorkspace(next);
      if (next.focusedCardId) {
        props.onFocusCard(next.focusedCardId);
      }
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, GalleryWorkspaceState | undefined>;
      const saved = parsed[props.run.id];
      const next = saved
        ? {
            focusedCardId: cards.some((card) => card.id === saved.focusedCardId) ? saved.focusedCardId : cards[0]?.id ?? "",
            viewport: saved.viewport ?? { zoom: 1, panX: 36, panY: 36 },
            annotationsByCard: cloneAnnotationsByCard(saved.annotationsByCard ?? {}),
          }
        : defaultWorkspace(cards);
      setWorkspace(next);
      if (next.focusedCardId) {
        props.onFocusCard(next.focusedCardId);
      }
    } catch {
      const next = defaultWorkspace(cards);
      setWorkspace(next);
      if (next.focusedCardId) {
        props.onFocusCard(next.focusedCardId);
      }
    }
  }, [cards, props.run.id, props.onFocusCard]);

  useEffect(() => {
    const raw = window.localStorage.getItem(GALLERY_STORAGE_KEY);
    let parsed: Record<string, GalleryWorkspaceState | undefined> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, GalleryWorkspaceState | undefined>;
      } catch {
        parsed = {};
      }
    }
    parsed[props.run.id] = {
      focusedCardId: workspace.focusedCardId,
      viewport: workspace.viewport,
      annotationsByCard: cloneAnnotationsByCard(workspace.annotationsByCard),
    };
    window.localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(parsed));
  }, [props.run.id, workspace]);

  useEffect(() => {
    if (workspace.focusedCardId) {
      props.onFocusCard(workspace.focusedCardId);
    }
  }, [props.onFocusCard, workspace.focusedCardId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const intensity = Math.abs(event.deltaY) > 32 ? 1.12 : 1.06;
      setWorkspace((current) => {
        const nextZoom = Math.max(0.45, Math.min(2.8, current.viewport.zoom * (event.deltaY < 0 ? intensity : 1 / intensity)));
        const worldX = (pointerX - current.viewport.panX) / current.viewport.zoom;
        const worldY = (pointerY - current.viewport.panY) / current.viewport.zoom;
        return {
          ...current,
          viewport: {
            zoom: nextZoom,
            panX: pointerX - worldX * nextZoom,
            panY: pointerY - worldY * nextZoom,
          },
        };
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
    };
  }, []);

  function focusCard(cardId: string): void {
    setWorkspace((current) => current.focusedCardId === cardId ? current : { ...current, focusedCardId: cardId });
  }

  function pointInCard(event: PointerEvent | React.PointerEvent, cardId: string): Point | null {
    const cardNode = viewportRef.current?.querySelector<HTMLElement>(`[data-gallery-card-id="${cardId}"] .codex-gallery-frame`);
    if (!cardNode) {
      return null;
    }
    const rect = cardNode.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    return {
      x: ((event.clientX - rect.left) / rect.width) * GALLERY_FRAME_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * GALLERY_FRAME_HEIGHT,
    };
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>): void {
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: workspace.viewport.panX,
      panY: workspace.viewport.panY,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function endInteraction(event?: React.PointerEvent<HTMLDivElement>): void {
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = null;
    moveRef.current = null;
    panRef.current = null;
  }

  function clearAnnotations(): void {
    setWorkspace((current) => ({ ...current, annotationsByCard: {} }));
    setSelectedAnnotation(null);
    setHoveredAnnotation(null);
  }

  return (
    <section className="codex-canvas-gallery panel" aria-label="Codex review gallery">
      <div className="codex-canvas-gallery-header">
        <div>
          <p className="codex-panel-kicker">Review Gallery</p>
          <h2>Before and Options</h2>
        </div>
        <div className="codex-run-actions">
          <span className="codex-meta-chip">{Math.round(workspace.viewport.zoom * 100)}%</span>
          <button className="codex-header-button" onClick={clearAnnotations} disabled={!Object.keys(workspace.annotationsByCard).length}>Clear Annotations</button>
          <button className="codex-header-button" onClick={props.onClose}>Close</button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="codex-gallery-workspace"
        onPointerDown={(event) => {
          if (event.button === 1) {
            beginPan(event);
            return;
          }
          const target = event.target as HTMLElement | null;
          const cardElement = target?.closest<HTMLElement>("[data-gallery-card-id]");
          const cardId = cardElement?.dataset.galleryCardId ?? "";
          if (!cardId) {
            if (event.button === 0 && props.annotationTool === "select") {
              beginPan(event);
            }
            return;
          }
          focusCard(cardId);
          if (event.button !== 0) {
            return;
          }
          const point = pointInCard(event, cardId);
          if (!point) {
            return;
          }
          const cardAnnotations = workspace.annotationsByCard[cardId] ?? [];
          if (props.annotationTool === "select") {
            const hit = hitTestAnnotation(point, cardAnnotations);
            setHoveredAnnotation(hit ? { cardId, annotationId: hit.id } : null);
            if (!hit) {
              setSelectedAnnotation(null);
              return;
            }
            moveRef.current = {
              cardId,
              annotationId: hit.id,
              start: point,
              originPoints: hit.points.map((item) => ({ ...item })),
            };
            setSelectedAnnotation({ cardId, annotationId: hit.id });
            return;
          }
          drawingRef.current = {
            cardId,
            id: `gallery-annotation-${Date.now()}`,
            kind: props.annotationTool === "highlight" ? "highlight" : props.annotationTool === "arrow" ? "arrow" : "freehand",
            color: props.annotationColor,
            start: point,
            created: false,
          };
          setSelectedAnnotation(null);
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (pan) {
            setWorkspace((current) => ({
              ...current,
              viewport: {
                ...current.viewport,
                panX: pan.panX + (event.clientX - pan.startX),
                panY: pan.panY + (event.clientY - pan.startY),
              },
            }));
            return;
          }
          const move = moveRef.current;
          if (move) {
            const point = pointInCard(event, move.cardId);
            if (!point) {
              return;
            }
            const deltaX = point.x - move.start.x;
            const deltaY = point.y - move.start.y;
            setWorkspace((current) => ({
              ...current,
              annotationsByCard: {
                ...current.annotationsByCard,
                [move.cardId]: (current.annotationsByCard[move.cardId] ?? []).map((annotation) => (
                  annotation.id !== move.annotationId
                    ? annotation
                    : {
                        ...annotation,
                        points: move.originPoints.map((originPoint) => ({
                          x: originPoint.x + deltaX,
                          y: originPoint.y + deltaY,
                        })),
                      }
                )),
              },
            }));
            return;
          }
          const drawing = drawingRef.current;
          if (drawing) {
            const point = pointInCard(event, drawing.cardId);
            if (!point) {
              return;
            }
            if (!drawing.created) {
              if (Math.hypot(point.x - drawing.start.x, point.y - drawing.start.y) < 6) {
                return;
              }
              drawing.created = true;
              setWorkspace((current) => ({
                ...current,
                annotationsByCard: {
                  ...current.annotationsByCard,
                  [drawing.cardId]: [
                    ...(current.annotationsByCard[drawing.cardId] ?? []),
                    {
                      id: drawing.id,
                      kind: drawing.kind,
                      color: drawing.color,
                      points: [drawing.start, point],
                    },
                  ],
                },
              }));
              setSelectedAnnotation({ cardId: drawing.cardId, annotationId: drawing.id });
              return;
            }
            setWorkspace((current) => ({
              ...current,
              annotationsByCard: {
                ...current.annotationsByCard,
                [drawing.cardId]: (current.annotationsByCard[drawing.cardId] ?? []).map((annotation) => {
                  if (annotation.id !== drawing.id) {
                    return annotation;
                  }
                  if (annotation.kind === "freehand") {
                    return { ...annotation, points: [...annotation.points, point] };
                  }
                  return { ...annotation, points: [annotation.points[0] ?? point, point] };
                }),
              },
            }));
            return;
          }
          if (props.annotationTool !== "select") {
            return;
          }
          const target = event.target as HTMLElement | null;
          const cardElement = target?.closest<HTMLElement>("[data-gallery-card-id]");
          const cardId = cardElement?.dataset.galleryCardId ?? "";
          if (!cardId) {
            setHoveredAnnotation(null);
            return;
          }
          const point = pointInCard(event, cardId);
          if (!point) {
            return;
          }
          const hit = hitTestAnnotation(point, workspace.annotationsByCard[cardId] ?? []);
          setHoveredAnnotation(hit ? { cardId, annotationId: hit.id } : null);
        }}
        onPointerUp={(event) => {
          endInteraction(event);
        }}
        onPointerCancel={(event) => {
          endInteraction(event);
        }}
        onPointerLeave={() => {
          setHoveredAnnotation(null);
        }}
      >
        <div
          className="codex-gallery-surface"
          style={{
            width: `${surfaceWidth}px`,
            height: `${surfaceHeight}px`,
            transform: `translate(${workspace.viewport.panX}px, ${workspace.viewport.panY}px) scale(${workspace.viewport.zoom})`,
            transformOrigin: "top left",
          }}
        >
          {cardFrames.map(({ card, left, top }) => {
            const token: PromptReferenceToken = { kind: "gallery", id: card.id, label: card.label };
            return (
              <article
                key={card.id}
                data-gallery-card-id={card.id}
                className={[
                  "codex-gallery-card",
                  "codex-gallery-card-workspace",
                  workspace.focusedCardId === card.id ? "is-focused" : "",
                  card.variant && props.run.appliedVariantId === card.variant.id ? "is-applied" : "",
                  card.reviewState === "rejected" ? "codex-gallery-card-rejected" : "",
                ].filter(Boolean).join(" ")}
                style={{ left: `${left}px`, top: `${top}px`, width: `${GALLERY_CARD_WIDTH}px` }}
              >
                <header>
                  <button className="codex-gallery-card-title" onClick={() => focusCard(card.id)}>{card.label}</button>
                  <div className="codex-gallery-card-header-actions">
                    <button
                      type="button"
                      className="codex-meta-chip codex-gallery-ref-chip"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
                        event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
                      }}
                    >
                      Drag Ref
                    </button>
                    <span>{card.statusLabel}</span>
                  </div>
                </header>
                <div className="codex-gallery-frame">
                  <img src={svgToDataUrl(card.svg)} alt={`${card.label} SVG preview`} />
                  <svg className="codex-gallery-annotation-layer" viewBox={`0 0 ${GALLERY_FRAME_WIDTH} ${GALLERY_FRAME_HEIGHT}`} preserveAspectRatio="none">
                    {(workspace.annotationsByCard[card.id] ?? []).map((annotation) => {
                      const selected = selectedAnnotation?.cardId === card.id && selectedAnnotation.annotationId === annotation.id;
                      const hovered = hoveredAnnotation?.cardId === card.id && hoveredAnnotation.annotationId === annotation.id;
                      const emphasized = selected || hovered;
                      if ((annotation.kind === "highlight" || annotation.kind === "selection") && annotation.points.length >= 2) {
                        const [start, end] = annotation.points;
                        return (
                          <rect
                            key={annotation.id}
                            x={Math.min(start.x, end.x)}
                            y={Math.min(start.y, end.y)}
                            width={Math.max(1, Math.abs(end.x - start.x))}
                            height={Math.max(1, Math.abs(end.y - start.y))}
                            rx={8}
                            ry={8}
                            fill={`${annotation.color}${annotation.kind === "selection" ? "14" : "22"}`}
                            stroke={annotation.color}
                            strokeWidth={emphasized ? 3.25 : 2}
                            strokeDasharray={annotation.kind === "selection" ? "10 6" : undefined}
                          />
                        );
                      }
                      if (annotation.kind === "arrow" && annotation.points.length >= 2) {
                        const [start, end] = annotation.points;
                        return (
                          <g key={annotation.id} stroke={annotation.color} strokeWidth={emphasized ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" fill="none">
                            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                            <path d={`M ${end.x} ${end.y} L ${end.x - 18} ${end.y - 10} M ${end.x} ${end.y} L ${end.x - 18} ${end.y + 10}`} />
                          </g>
                        );
                      }
                      if (annotation.kind === "freehand" && annotation.points.length >= 2) {
                        const d = annotation.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
                        return (
                          <path
                            key={annotation.id}
                            d={d}
                            fill="none"
                            stroke={annotation.color}
                            strokeWidth={emphasized ? 5 : 3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      }
                      return null;
                    })}
                  </svg>
                </div>
                {card.variant ? (
                  <div className="codex-variant-actions">
                    {card.variant.reviewState === "pending" ? (
                      <>
                        <button onClick={() => dispatchGalleryAction({ action: "mark", runId: props.run.id, variantId: card.variant?.id })}>
                          {card.variant.markedForRevision ? "Marked" : "Mark"}
                        </button>
                        <button onClick={() => dispatchGalleryAction({ action: "reject", runId: props.run.id, variantId: card.variant?.id })}>Reject</button>
                        <button onClick={() => dispatchGalleryAction({ action: "apply", runId: props.run.id, variantId: card.variant?.id })} disabled={card.variant.state !== "completed"}>
                          Apply
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
