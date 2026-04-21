import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, Ref, WheelEvent as ReactWheelEvent } from "react";

import { elementKind, getEditableElement, getEditableElementAtPoint } from "../../shared/lib/svg/selectability";
import type { AlignmentGuide, CodexAnnotation, CodexAnnotationTool, SelectedElement, SelectionBox, ToolMode } from "../../shared/types/editor";

export function CanvasViewport(props: {
  showHelpers: boolean;
  previewRef: Ref<HTMLDivElement>;
  canvasViewportRef: Ref<HTMLDivElement>;
  svgHostRef: Ref<HTMLDivElement>;
  viewport: { zoom: number; panX: number; panY: number; artboardWidth: number; artboardHeight: number };
  cursorPoint: { x: number; y: number } | null;
  toolMode: ToolMode;
  codexMode: boolean;
  codexAnnotationTool: CodexAnnotationTool;
  codexAnnotations: CodexAnnotation[];
  selectedCodexAnnotationId: string;
  hoveredCodexAnnotationId: string;
  selected: SelectedElement | null;
  selectedCount: number;
  selectionBox: SelectionBox | null;
  selectionOverlayRef: Ref<HTMLDivElement>;
  marqueeBox: SelectionBox | null;
  alignmentGuides: AlignmentGuide[];
  editingTextId: string;
  editingTextValue: string;
  editingTextBox: SelectionBox | null;
  rulerMarks: number[];
  selectableSelection: boolean;
  onViewportPointerDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onViewportWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onCursorMove: (clientX: number, clientY: number) => void;
  onCursorLeave: () => void;
  onSelectEditable: (editable: SVGElement | null, options?: { additive?: boolean; toggle?: boolean; event?: ReactPointerEvent<HTMLDivElement> }) => void;
  onBeginTextEdit: (editable: SVGElement | null) => void;
  onEditingTextChange: (value: string) => void;
  onCommitTextEdit: () => void;
  onCancelTextEdit: () => void;
  onImportAssetToSlot: (sourcePath: string, slotElement: SVGElement) => void;
  onCodexPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => boolean;
  onCodexPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCodexPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStartMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartResize: (event: ReactMouseEvent<HTMLDivElement>, handle: string) => void;
}) {
  return (
    <div className="canvas-panel panel">
      <div
        ref={props.previewRef}
        className="preview-wrap"
        onMouseDown={props.onViewportPointerDown}
        onWheel={props.onViewportWheel}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
          }
        }}
      >
        <div className="ruler ruler-top">
          {props.rulerMarks
            .filter((mark) => mark <= props.viewport.artboardWidth)
            .map((mark) => (
              <span key={`x-${mark}`} className="ruler-mark" style={{ left: `${props.viewport.panX + mark * props.viewport.zoom}px` }}>
                {mark}
              </span>
            ))}
        </div>
        <div className="ruler ruler-left">
          {props.rulerMarks
            .filter((mark) => mark <= props.viewport.artboardHeight)
            .map((mark) => (
              <span key={`y-${mark}`} className="ruler-mark vertical" style={{ top: `${props.viewport.panY + mark * props.viewport.zoom}px` }}>
                {mark}
              </span>
            ))}
        </div>
        {props.showHelpers ? (
          <div className="preview-hint">Tool: {props.toolMode}. Space+drag pans. Shift/Ctrl-click adds or toggles. Drag empty canvas for marquee.</div>
        ) : null}
        <div className="canvas-readout canvas-readout-overlay">
          <span>{Math.round(props.viewport.artboardWidth)} × {Math.round(props.viewport.artboardHeight)}</span>
          <span>{Math.round(props.viewport.zoom * 100)}%</span>
          <span>{props.cursorPoint ? `${Math.round(props.cursorPoint.x)}, ${Math.round(props.cursorPoint.y)}` : "cursor --,--"}</span>
          {props.selected ? <span>{Math.round(props.selected.width)} × {Math.round(props.selected.height)}</span> : null}
        </div>
        <div
          ref={props.canvasViewportRef}
          className="canvas-viewport"
          onPointerLeave={(event) => {
            props.onCursorLeave();
            if (props.codexMode) {
              props.onCodexPointerUp(event);
            }
          }}
          onDoubleClick={(event) => {
            const editable = getEditableElementAtPoint(event.target, event.clientX, event.clientY);
            props.onBeginTextEdit(editable);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            if (props.codexMode && props.onCodexPointerDown(event)) {
              return;
            }
            const editable = getEditableElementAtPoint(event.target, event.clientX, event.clientY);
            if (!editable || !editable.id) {
              props.onSelectEditable(null, { event });
              return;
            }
            props.onSelectEditable(editable, {
              toggle: event.shiftKey || event.metaKey || event.ctrlKey,
              event,
            });
          }}
          onDragOver={(event) => {
            const slot = getEditableElement(event.target);
            if (slot && elementKind(slot) === "slot") {
              event.preventDefault();
              slot.setAttribute("data-drop-target", "true");
            }
          }}
          onDragLeave={(event) => {
            const slot = getEditableElement(event.target);
            slot?.removeAttribute("data-drop-target");
          }}
          onDrop={(event) => {
            const slot = getEditableElement(event.target);
            if (!slot || elementKind(slot) !== "slot") {
              return;
            }
            event.preventDefault();
            slot.removeAttribute("data-drop-target");
            const sourcePath = event.dataTransfer?.getData("text/plain");
            if (sourcePath) {
              props.onImportAssetToSlot(sourcePath, slot);
            }
          }}
          onPointerMove={(event) => {
            props.onCursorMove(event.clientX, event.clientY);
            if (props.codexMode) {
              props.onCodexPointerMove(event);
            }
          }}
          onPointerUp={(event) => {
            if (props.codexMode) {
              props.onCodexPointerUp(event);
            }
          }}
          onPointerCancel={(event) => {
            if (props.codexMode) {
              props.onCodexPointerUp(event);
            }
          }}
        >
          <div
            className="svg-stage"
            style={{
              transform: `translate(${props.viewport.panX}px, ${props.viewport.panY}px) scale(${props.viewport.zoom})`,
              transformOrigin: "top left",
              width: `${props.viewport.artboardWidth}px`,
              height: `${props.viewport.artboardHeight}px`,
            }}
          >
            <div ref={props.svgHostRef} className="svg-host" />
          </div>
          <div
            className="artboard-guides"
            style={{
              left: `${props.viewport.panX}px`,
              top: `${props.viewport.panY}px`,
              width: `${props.viewport.artboardWidth * props.viewport.zoom}px`,
              height: `${props.viewport.artboardHeight * props.viewport.zoom}px`,
            }}
          />
          {props.codexAnnotations.length ? (
            <svg
              className="codex-canvas-overlay"
              style={{
                left: `${props.viewport.panX}px`,
                top: `${props.viewport.panY}px`,
                width: `${props.viewport.artboardWidth * props.viewport.zoom}px`,
                height: `${props.viewport.artboardHeight * props.viewport.zoom}px`,
              }}
              viewBox={`0 0 ${props.viewport.artboardWidth} ${props.viewport.artboardHeight}`}
              preserveAspectRatio="none"
            >
              {props.codexAnnotations.map((annotation) => {
                const selected = annotation.id === props.selectedCodexAnnotationId;
                const hovered = annotation.id === props.hoveredCodexAnnotationId;
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
                      opacity={hovered && !selected ? 0.92 : 1}
                    />
                  );
                }
                if (annotation.kind === "arrow" && annotation.points.length >= 2) {
                  const [start, end] = annotation.points;
                  return (
                    <g key={annotation.id} stroke={annotation.color} strokeWidth={emphasized ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={hovered && !selected ? 0.92 : 1}>
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
                      opacity={hovered && !selected ? 0.92 : 1}
                    />
                  );
                }
                return null;
              })}
            </svg>
          ) : null}
          {props.alignmentGuides.map((guide, index) => (
            <div
              key={`${guide.orientation}-${guide.position}-${index}`}
              className={`alignment-guide alignment-guide-${guide.orientation}`}
              style={
                guide.orientation === "vertical"
                  ? {
                      left: props.viewport.panX + guide.position * props.viewport.zoom,
                      top: props.viewport.panY + guide.start * props.viewport.zoom,
                      height: (guide.end - guide.start) * props.viewport.zoom,
                    }
                  : {
                      top: props.viewport.panY + guide.position * props.viewport.zoom,
                      left: props.viewport.panX + guide.start * props.viewport.zoom,
                      width: (guide.end - guide.start) * props.viewport.zoom,
                    }
              }
            />
          ))}
          {props.marqueeBox ? (
            <div
              className="marquee-selection"
              style={{
                left: props.marqueeBox.left,
                top: props.marqueeBox.top,
                width: props.marqueeBox.width,
                height: props.marqueeBox.height,
              }}
            />
          ) : null}
          {props.selectionBox ? (
            <div
              ref={props.selectionOverlayRef}
              className="selection-overlay"
              style={{
                left: props.selectionBox.left,
                top: props.selectionBox.top,
                width: props.selectionBox.width,
                height: props.selectionBox.height,
              }}
            >
              <div className="selection-label">{props.selectedCount > 1 ? `${props.selectedCount} objects` : props.selected?.label}</div>
              {props.selectableSelection ? (
                <>
                  <div className="selection-drag-handle" onPointerDown={(event) => event.stopPropagation()} onMouseDown={props.onStartMove} />
                  {props.selectedCount === 1 && props.selected?.canResize ? (
                    <>
                      {(["n", "e", "s", "w", "ne", "nw", "se", "sw"] as const).map((handle) => (
                        <div
                          key={handle}
                          className={`resize-handle resize-handle-${handle}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            props.onStartResize(event, handle);
                          }}
                        />
                      ))}
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {props.editingTextId && props.editingTextBox ? (
            <textarea
              className="inline-text-editor"
              style={{
                left: props.editingTextBox.left,
                top: props.editingTextBox.top,
                width: props.editingTextBox.width,
                minHeight: props.editingTextBox.height,
              }}
              value={props.editingTextValue}
              autoFocus
              onChange={(event) => props.onEditingTextChange(event.target.value)}
              onBlur={props.onCommitTextEdit}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  props.onCancelTextEdit();
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  props.onCommitTextEdit();
                }
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
