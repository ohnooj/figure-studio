import { useRef } from "react";

import { useScrollShadowState } from "../../app/hooks/useScrollShadowState";
import type { FigureEntry } from "../../shared/types/editor";

export function FigureTabs(props: {
  figures: FigureEntry[];
  activeFigureId: string;
  renamingFigureId: string;
  renameDraft: string;
  disabled: boolean;
  onSelect: (figureId: string) => void;
  onBeginRename: (figure: FigureEntry) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: (figureId: string) => void;
  onCancelRename: () => void;
  onCreate: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; scrollLeft: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const { canScrollStart, canScrollEnd } = useScrollShadowState(scrollRef, "horizontal", [
    props.figures.length,
    props.activeFigureId,
    props.renamingFigureId,
  ]);

  return (
    <div className="figure-strip">
      <div className={["figure-tabs-frame", canScrollStart ? "can-scroll-start" : "", canScrollEnd ? "can-scroll-end" : ""].filter(Boolean).join(" ")}>
        <div
          ref={scrollRef}
          className="figure-tabs-scroll figure-tabs-scroll-horizontal figure-tabs-drag-scroll"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            const target = event.target;
            if (target instanceof HTMLElement && target.closest("input")) {
              return;
            }
            dragStateRef.current = {
              startX: event.clientX,
              scrollLeft: scrollRef.current?.scrollLeft ?? 0,
              moved: false,
            };
          }}
          onMouseMove={(event) => {
            const drag = dragStateRef.current;
            const scroller = scrollRef.current;
            if (!drag || !scroller) {
              return;
            }
            const dx = event.clientX - drag.startX;
            if (Math.abs(dx) > 3) {
              drag.moved = true;
              movedRef.current = true;
            }
            scroller.scrollLeft = drag.scrollLeft - dx;
          }}
          onMouseUp={() => {
            const moved = dragStateRef.current?.moved ?? false;
            dragStateRef.current = null;
            if (moved) {
              window.setTimeout(() => {
                movedRef.current = false;
              }, 0);
            }
          }}
          onMouseLeave={() => {
            dragStateRef.current = null;
          }}
        >
          <div className="tabs tabs-horizontal browser-tabs">
            {props.figures.map((figure) => {
              const isActive = figure.id === props.activeFigureId;
              const isEditing = figure.id === props.renamingFigureId;
              return (
                <div
                  key={figure.id}
                  className={isActive ? "tab browser-tab active" : "tab browser-tab"}
                  onClick={() => {
                    if (movedRef.current) {
                      return;
                    }
                    if (!isEditing) {
                      props.onSelect(figure.id);
                    }
                  }}
                >
                  {isEditing ? (
                    <input
                      className="tab-title-input"
                      value={props.renameDraft}
                      autoFocus
                      onChange={(event) => props.onRenameDraftChange(event.target.value)}
                      onBlur={() => props.onCommitRename(figure.id)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          props.onCommitRename(figure.id);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          props.onCancelRename();
                        }
                      }}
                    />
                  ) : (
                    <button className="tab-button" onDoubleClick={() => props.onBeginRename(figure)} title={figure.id}>
                      <span className="tab-button-label">{figure.title}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button className="figure-add-button" disabled={props.disabled} onClick={props.onCreate} title="Create new figure">
        +
      </button>
    </div>
  );
}
