import type { CodexFigureContext } from "../../shared/types/editor";

function annotationLabel(kind: CodexFigureContext["annotations"][number]["kind"], index: number): string {
  const prefix =
    kind === "selection"
      ? "Selection"
      : kind === "highlight"
        ? "Highlight"
        : kind === "arrow"
          ? "Arrow"
          : "Freehand";
  return `${prefix} ${index + 1}`;
}

export function AttachedPayloadPanel(props: { context: CodexFigureContext | null }) {
  const context = props.context;
  const svgLength = context?.svg.trim().length ?? 0;

  return (
    <div className="rail-pane payload-section">
      <div className="payload-metadata">
        <div className="section-heading">
          <h2>Metadata</h2>
        </div>
        <div className="payload-preview-frame">
          {context ? (
            <div className="payload-summary">
              <section className="payload-card">
                <div className="payload-card-header">
                  <span className="payload-card-title">Current Figure</span>
                  <span className="payload-card-chip">{context.figureId}</span>
                </div>
                <p className="payload-card-copy">{context.figureTitle || "Untitled figure"}</p>
              </section>

              <section className="payload-card">
                <div className="payload-card-header">
                  <span className="payload-card-title">Current SVG</span>
                  <span className="payload-card-chip">{svgLength.toLocaleString()} chars</span>
                </div>
                <p className="payload-card-copy">The live figure SVG is attached as structured context for this chat.</p>
                <details className="payload-raw">
                  <summary>Show SVG source</summary>
                  <pre className="payload-preview">{context.svg}</pre>
                </details>
              </section>

              <section className="payload-card">
                <div className="payload-card-header">
                  <span className="payload-card-title">Selected Objects</span>
                  <span className="payload-card-chip">{context.selectedObjects.length}</span>
                </div>
                {context.selectedObjects.length ? (
                  <div className="payload-pill-list">
                    {context.selectedObjects.map((item) => (
                      <span key={item.id} className="payload-pill" title={item.id}>
                        {item.label || item.id}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="payload-card-copy">No objects selected.</p>
                )}
              </section>

              <section className="payload-card">
                <div className="payload-card-header">
                  <span className="payload-card-title">Current Annotations</span>
                  <span className="payload-card-chip">{context.annotations.length}</span>
                </div>
                {context.annotations.length ? (
                  <div className="payload-pill-list">
                    {context.annotations.map((annotation, index) => (
                      <span key={annotation.id} className="payload-pill" title={annotation.id}>
                        {annotationLabel(annotation.kind, index)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="payload-card-copy">No query annotations.</p>
                )}
              </section>

              <section className="payload-card">
                <div className="payload-card-header">
                  <span className="payload-card-title">Attached Image</span>
                  <span className="payload-card-chip">{context.annotatedImageUrl ? "yes" : "no"}</span>
                </div>
                <p className="payload-card-copy">
                  {context.annotatedImageUrl
                    ? "An image representation is available in the figure context."
                    : "No figure image is attached in the current context."}
                </p>
              </section>
            </div>
          ) : (
            <p className="empty-copy">No active metadata.</p>
          )}
        </div>
      </div>
    </div>
  );
}
