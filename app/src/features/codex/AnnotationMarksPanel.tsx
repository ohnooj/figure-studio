import type { CodexAnnotation } from "../../shared/types/editor";
import { CODEX_PROMPT_REFERENCE_MIME, annotationPromptLabel, renderPromptTokenContent, serializePromptReferenceToken } from "./promptTokens";

export function AnnotationMarksPanel(props: {
  height: number;
  annotations: CodexAnnotation[];
  selectedAnnotationId: string;
  hoveredAnnotationId: string;
  linkedObjectIds: string[];
  onSelect: (annotationId: string) => void;
  onHover: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="rail-pane annotation-section" style={{ flex: `0 0 ${props.height}px` }}>
      <div className="section-heading">
        <h2>Query Annotations</h2>
        <div className="asset-actions">
          <button disabled={!props.annotations.length} onClick={props.onClear}>
            Clear
          </button>
        </div>
      </div>
      {props.annotations.length ? (
        <div className="annotation-list">
          {props.annotations.map((annotation, index) => (
            <div key={annotation.id} className="annotation-card-row">
              {(() => {
                const linked = Boolean(annotation.selectedIds?.some((id) => props.linkedObjectIds.includes(id)));
                const className = [
                  "codex-reference-chip",
                  "codex-reference-chip-annotation",
                  "annotation-chip",
                  annotation.id === props.selectedAnnotationId ? "active" : "",
                  annotation.id === props.hoveredAnnotationId ? "hovered" : "",
                  linked ? "linked" : "",
                ].filter(Boolean).join(" ");
                return (
              <button
                className={className}
                draggable
                onDragStart={(event) => {
                  const token = {
                    kind: "annotation" as const,
                    id: annotation.id,
                    label: annotationPromptLabel(annotation, index),
                  };
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
                  event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
                }}
                onClick={() => props.onSelect(annotation.id)}
                onMouseEnter={() => props.onHover(annotation.id)}
                onMouseLeave={() => props.onHover("")}
              >
                {renderPromptTokenContent({ kind: "annotation", id: annotation.id, label: annotationPromptLabel(annotation, index) }, {
                  figureId: "",
                  figureTitle: "",
                  svg: "",
                  selectedIds: [],
                  selectedObjects: [],
                  annotations: [annotation],
                })}
              </button>
                );
              })()}
              <button className="annotation-delete" aria-label="Delete annotation" onClick={() => props.onDelete(annotation.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-copy">No query annotations yet.</p>
      )}
    </div>
  );
}
