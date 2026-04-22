import type { DragEvent as ReactDragEvent, Ref, RefObject } from "react";

import type { CodexFigureContext, CodexRun, CodexRunVariant, CodexThread } from "../../shared/types/editor";
import { collectAssistantMarkdown, isRunProcessing, runStatusLabel, SimpleMarkdown } from "./codexFormatting";
import { renderPromptSegments } from "./promptTokens";

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function SvgComparisonCard(props: { beforeSvg: string; afterSvg: string }) {
  const beforeSvg = props.beforeSvg.trim();
  const afterSvg = props.afterSvg.trim();
  const hasBefore = beforeSvg.includes("<svg");
  const hasAfter = afterSvg.includes("<svg");
  const canRenderComparison = hasBefore && hasAfter;

  return (
    <details className="codex-diff-card">
      <summary>Visual preview</summary>
      {canRenderComparison ? (
        <div className="codex-svg-compare">
          <section className="codex-svg-panel">
            <header>Before</header>
            <div className="codex-svg-frame">
              <img src={svgToDataUrl(beforeSvg)} alt="SVG before Codex changes" />
            </div>
          </section>
          <section className="codex-svg-panel">
            <header>After</header>
            <div className="codex-svg-frame">
              <img src={svgToDataUrl(afterSvg)} alt="SVG after Codex changes" />
            </div>
          </section>
        </div>
      ) : (
        <p className="codex-muted">A visual before/after preview is only available when this run captured both the original SVG and the staged SVG.</p>
      )}
    </details>
  );
}

function startPromptTextDrag(event: ReactDragEvent<HTMLElement>, text: string): void {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", text);
}

function focusVariantControls(run: CodexRun, variant: CodexRunVariant): void {
  window.dispatchEvent(new CustomEvent("paper_figures:codex_variant_focus", { detail: { run, variant } }));
}

type HoverHandlers = {
  onHoverAnnotation: (annotationId: string) => void;
  onHoverObject: (objectId: string) => void;
};

type SelectionState = {
  selectedCodexAnnotationId: string;
  hoveredCodexAnnotationId: string;
  linkedObjectIds: string[];
  hoveredObjectId: string;
};

export function CodexTranscript(props: {
  activeThread: CodexThread | null;
  figureContext: CodexFigureContext | null;
  transcriptRef: RefObject<HTMLDivElement | null>;
  copiedMessageKey: string;
  selectedState: SelectionState;
  hoverHandlers: HoverHandlers;
  onScroll: () => void;
  onCopyMessage: (messageKey: string, text: string) => Promise<void>;
  onExpandRun: (runId: string) => void;
  onApplyVariant: (variant: CodexRunVariant) => Promise<void>;
  onRejectVariant: (variant: CodexRunVariant) => Promise<void>;
  onToggleVariantMark: (variant: CodexRunVariant) => Promise<void>;
}) {
  return (
    <div className="codex-transcript-shell">
      <div ref={props.transcriptRef as Ref<HTMLDivElement>} className="codex-transcript-inline" onScroll={props.onScroll}>
        {props.activeThread?.runs.length ? (
          props.activeThread.runs.map((run) => {
            const assistantMarkdown = collectAssistantMarkdown(run);
            const processing = isRunProcessing(run);
            const messageLocked = run.reviewState === "applied";
            return (
              <div key={run.id} className="codex-run-block">
                <article className="codex-message codex-message-user">
                  <div className="codex-message-drag-strip">
                    <button
                      type="button"
                      className="codex-message-drag-handle"
                      aria-label="Drag message into prompt"
                      title="Drag into prompt"
                      draggable
                      onDragStart={(event) => startPromptTextDrag(event, run.prompt)}
                    >
                      <span className="codex-message-drag-glyph" aria-hidden="true" />
                    </button>
                  </div>
                  <header>
                    <div className="codex-message-meta">
                      <span className="codex-message-role">You</span>
                      <time>{new Date(run.createdAt * 1000).toLocaleTimeString()}</time>
                    </div>
                    <div className="codex-message-actions">
                      <button
                        type="button"
                        className="codex-copy-button"
                        aria-label={props.copiedMessageKey === `${run.id}:user` ? "Copied" : "Copy message"}
                        title={props.copiedMessageKey === `${run.id}:user` ? "Copied" : "Copy"}
                        onClick={() => void props.onCopyMessage(`${run.id}:user`, run.prompt)}
                      >
                        <span aria-hidden="true">{props.copiedMessageKey === `${run.id}:user` ? "✓" : "⧉"}</span>
                      </button>
                    </div>
                  </header>
                  <div className="codex-message-body codex-message-body-enter">
                    <p className="codex-prompt-rendered">
                      {renderPromptSegments(run.prompt, {
                        context: run.figureContext,
                        draggable: true,
                        selectedObjectIds: props.figureContext?.selectedIds ?? [],
                        linkedObjectIds: props.selectedState.linkedObjectIds,
                        hoveredObjectId: props.selectedState.hoveredObjectId,
                        selectedAnnotationId: props.selectedState.selectedCodexAnnotationId,
                        hoveredAnnotationId: props.selectedState.hoveredCodexAnnotationId,
                        onHoverObject: props.hoverHandlers.onHoverObject,
                        onHoverAnnotation: props.hoverHandlers.onHoverAnnotation,
                      })}
                    </p>
                  </div>
                </article>
                <article className="codex-message codex-message-assistant">
                  <div className="codex-message-drag-strip">
                    <button
                      type="button"
                      className="codex-message-drag-handle"
                      aria-label="Drag message into prompt"
                      title="Drag into prompt"
                      draggable
                      onDragStart={(event) => startPromptTextDrag(event, assistantMarkdown)}
                      disabled={!assistantMarkdown}
                    >
                      <span className="codex-message-drag-glyph" aria-hidden="true" />
                    </button>
                  </div>
                  <header>
                    <div className="codex-message-meta">
                      <span className="codex-message-role">Codex</span>
                      <span>{runStatusLabel(run)}</span>
                    </div>
                    <div className="codex-message-actions">
                      <button
                        type="button"
                        className="codex-copy-button"
                        aria-label={props.copiedMessageKey === `${run.id}:assistant` ? "Copied" : "Copy message"}
                        title={props.copiedMessageKey === `${run.id}:assistant` ? "Copied" : "Copy"}
                        onClick={() => void props.onCopyMessage(`${run.id}:assistant`, assistantMarkdown)}
                      >
                        <span aria-hidden="true">{props.copiedMessageKey === `${run.id}:assistant` ? "✓" : "⧉"}</span>
                      </button>
                    </div>
                  </header>
                  {assistantMarkdown ? (
                    <div className={`codex-message-body codex-message-body-enter${processing ? " codex-message-body-streaming" : ""}`}>
                      <SimpleMarkdown text={assistantMarkdown} />
                    </div>
                  ) : null}
                  {processing ? (
                    <div className="codex-message-typing" aria-live="polite" aria-label={runStatusLabel(run)}>
                      <span className="codex-message-typing-dot" />
                      <span className="codex-message-typing-dot" />
                      <span className="codex-message-typing-dot" />
                    </div>
                  ) : null}
                  {!assistantMarkdown && !processing ? <p className="codex-muted">No Codex reply was captured for this turn.</p> : null}
                  <div className="codex-run-actions">
                    <button onClick={() => props.onExpandRun(run.id)} disabled={!run.variants.length}>Enlarge</button>
                    {messageLocked ? <span className="codex-meta-chip">Applied</span> : null}
                  </div>
                  <div className="codex-variant-list">
                    {run.variants.map((variant) => (
                      <section
                        key={variant.id}
                        className={`codex-variant-card codex-variant-card-${variant.reviewState}${run.appliedVariantId === variant.id ? " is-applied" : ""}`}
                      >
                        <header>
                          <div className="codex-message-meta">
                            <span className="codex-message-role">{variant.label}</span>
                            <span>{variant.reviewState === "pending" ? runStatusLabel({ ...run, currentStatus: variant.currentStatus, state: variant.state } as CodexRun) : variant.reviewState}</span>
                          </div>
                        </header>
                        {(variant.interactivePreviewSvg ?? variant.latestPreviewSvg) ? (
                          <SvgComparisonCard beforeSvg={run.figureContext.svg ?? ""} afterSvg={variant.interactivePreviewSvg ?? variant.latestPreviewSvg ?? ""} />
                        ) : (
                          <p className="codex-muted">Waiting for a renderable SVG preview.</p>
                        )}
                        <div className="codex-variant-actions">
                          {!messageLocked && variant.reviewState === "pending" ? (
                            <>
                              {variant.controlManifest ? <button onClick={() => focusVariantControls(run, variant)}>Tune</button> : null}
                              <button onClick={() => void props.onToggleVariantMark(variant)}>
                                {variant.markedForRevision ? "Marked" : "Mark"}
                              </button>
                              <button onClick={() => void props.onRejectVariant(variant)}>Reject</button>
                              <button onClick={() => void props.onApplyVariant(variant)} disabled={variant.state !== "completed"}>Apply</button>
                            </>
                          ) : null}
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              </div>
            );
          })
        ) : (
          <p className="codex-muted">No messages in this chat yet.</p>
        )}
      </div>
    </div>
  );
}
