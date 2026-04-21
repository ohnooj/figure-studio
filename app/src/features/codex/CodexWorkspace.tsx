import { useEffect, useId, useMemo, useState } from "react";

import type { CodexFigureContext, CodexRun, FigureSource } from "../../shared/types/editor";
import { copyTextToClipboard } from "./copy";
import { collectAssistantMarkdown, isRunProcessing, runStatusLabel, SimpleMarkdown } from "./codexFormatting";
import { PromptEditor } from "./PromptEditor";
import { CODEX_PROMPT_REFERENCE_MIME, annotationPromptLabel, objectPromptLabel, parsePromptSegments, renderPromptSegments, renderPromptTokenContent, serializePromptReferenceToken } from "./promptTokens";
import { CODEX_MODEL_OPTIONS, useCodexWorkspace } from "./useCodexWorkspace";

const REASONING_EFFORT_OPTIONS = [
  { value: "low", label: "Effort: Low" },
  { value: "medium", label: "Effort: Medium" },
  { value: "high", label: "Effort: High" },
  { value: "xhigh", label: "Effort: XHigh" },
] as const;

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

type CodexGalleryActionDetail = {
  action: "apply" | "reject" | "mark" | "close";
  runId: string;
  variantId?: string;
};

type CodexGallerySyncDetail = {
  run: CodexRun | null;
};

export function CodexWorkspace(props: {
  activeFigure: FigureSource | null;
  figureContext: CodexFigureContext | null;
  selectedCodexAnnotationId: string;
  hoveredCodexAnnotationId: string;
  linkedObjectIds: string[];
  hoveredObjectId: string;
  onHoverAnnotation: (annotationId: string) => void;
  onHoverObject: (objectId: string) => void;
  onStatus: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const inputId = useId();
  const [expandedRunId, setExpandedRunId] = useState("");
  const [composerHeight, setComposerHeight] = useState(238);
  const [composerResizeState, setComposerResizeState] = useState<{ startY: number; startHeight: number } | null>(null);
  const {
    threads,
    activeThreadId,
    activeThread,
    activeRun,
    activeRunInProgress,
    prompt,
    setPrompt,
    isSending,
    optionsOpen,
    setOptionsOpen,
    copiedMessageKey,
    setCopiedMessageKey,
    selectedCommandIndex,
    setSelectedCommandIndex,
    commandSuggestions,
    contextUsagePercent,
    weeklyUsageTokens,
    weeklyQuotaTokens,
    weeklyUsagePercent,
    activeOptionChips,
    transcriptRef,
    updateAutoScrollState,
    selectThread,
    handleNewChat,
    handleClearThread,
    handleDeleteThread,
    handleSend,
    handleCancelRun,
    handleApplyVariant,
    handleRejectVariant,
    handleToggleVariantMark,
    executeLocalCommand,
    clearActiveOptionChip,
    includeFigureContext,
    currentFigureLabel,
    planMode,
    resultsCount,
    cycleResultsCount,
    setWeeklyQuotaTokens,
    activeModel,
    activeReasoningEffort,
    handleModelChange,
    handleReasoningEffortChange,
  } = useCodexWorkspace(props);
  const expandedRun = activeThread?.runs.find((run) => run.id === expandedRunId) ?? null;
  const referenceContext = useMemo(() => props.figureContext ?? null, [props.figureContext]);
  const hasReferenceItems = Boolean(
    referenceContext && (referenceContext.selectedObjects.length || referenceContext.annotations.length),
  );
  const referenceTokens = useMemo(() => {
    if (!referenceContext) {
      return { objects: [], annotations: [] };
    }
    return {
      objects: referenceContext.selectedObjects.map((item) => ({
        kind: "object" as const,
        id: item.id,
        label: objectPromptLabel(item),
        objectKind: item.kind,
      })),
      annotations: (props.figureContext?.annotations ?? []).map((annotation, index) => ({
        kind: "annotation" as const,
        id: annotation.id,
        label: annotationPromptLabel(annotation, index),
      })),
    };
  }, [props.figureContext, referenceContext]);
  const recentReferenceTokens = useMemo(() => {
    if (!activeThread || !referenceContext) {
      return [] as { kind: "object" | "annotation"; id: string; label: string; objectKind?: string }[];
    }
    const liveObjectIds = new Set(referenceTokens.objects.map((token) => token.id));
    const liveAnnotationIds = new Set(referenceTokens.annotations.map((token) => token.id));
    const seen = new Set<string>();
    const recent: { kind: "object" | "annotation"; id: string; label: string; objectKind?: string }[] = [];
    for (let runIndex = activeThread.runs.length - 1; runIndex >= 0; runIndex -= 1) {
      const run = activeThread.runs[runIndex];
      const segments = parsePromptSegments(run.prompt);
      for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
        const segment = segments[segmentIndex];
        if (segment.type !== "token" || segment.token.kind === "gallery") {
          continue;
        }
        const key = `${segment.token.kind}:${segment.token.id}`;
        if (seen.has(key)) {
          continue;
        }
        if (segment.token.kind === "annotation") {
          const annotationIndex = referenceContext.annotations.findIndex((annotation) => annotation.id === segment.token.id);
          if (annotationIndex === -1 || liveAnnotationIds.has(segment.token.id)) {
            continue;
          }
          seen.add(key);
          recent.push({
            kind: "annotation",
            id: segment.token.id,
            label: annotationPromptLabel(referenceContext.annotations[annotationIndex], annotationIndex),
          });
          continue;
        }
        const object = referenceContext.selectedObjects.find((item) => item.id === segment.token.id);
        if (!object || liveObjectIds.has(segment.token.id)) {
          continue;
        }
        seen.add(key);
        recent.push({
          kind: "object",
          id: segment.token.id,
          label: objectPromptLabel(object),
          objectKind: object.kind,
        });
      }
    }
    return recent.slice(0, 8);
  }, [activeThread, referenceContext, referenceTokens.annotations, referenceTokens.objects]);
  const hasVisualReferences = hasReferenceItems || recentReferenceTokens.length > 0;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<CodexGallerySyncDetail>("paper_figures:codex_gallery_sync", { detail: { run: expandedRun } }));
  }, [expandedRun]);

  useEffect(() => {
    setExpandedRunId("");
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent<CodexGallerySyncDetail>("paper_figures:codex_gallery_sync", { detail: { run: null } }));
    };
  }, []);

  useEffect(() => {
    if (!composerResizeState) {
      return;
    }
    const onPointerMove = (event: PointerEvent): void => {
      const nextHeight = Math.max(180, Math.min(420, composerResizeState.startHeight + (composerResizeState.startY - event.clientY)));
      setComposerHeight(nextHeight);
    };
    const onPointerUp = (): void => setComposerResizeState(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [composerResizeState]);

  useEffect(() => {
    const onGalleryAction = (event: Event): void => {
      const detail = (event as CustomEvent<CodexGalleryActionDetail>).detail;
      if (!detail || !expandedRun || detail.runId !== expandedRun.id) {
        return;
      }
      if (detail.action === "close") {
        setExpandedRunId("");
        return;
      }
      if (!detail.variantId) {
        return;
      }
      const variant = expandedRun.variants.find((item) => item.id === detail.variantId) ?? null;
      if (!variant) {
        return;
      }
      if (detail.action === "apply") {
        void handleApplyVariant(variant).then(() => setExpandedRunId(""));
        return;
      }
      if (detail.action === "reject") {
        void handleRejectVariant(variant);
        return;
      }
      void handleToggleVariantMark(variant);
    };
    window.addEventListener("paper_figures:codex_gallery_action", onGalleryAction as EventListener);
    return () => window.removeEventListener("paper_figures:codex_gallery_action", onGalleryAction as EventListener);
  }, [expandedRun, handleApplyVariant, handleRejectVariant, handleToggleVariantMark]);

  async function handleCopyMessage(messageKey: string, text: string): Promise<void> {
    try {
      await copyTextToClipboard(text);
      setCopiedMessageKey(messageKey);
      window.setTimeout(() => {
        setCopiedMessageKey((current) => (current === messageKey ? "" : current));
      }, 1200);
    } catch (error) {
      props.onStatus(error instanceof Error ? error.message : "Failed to copy message.", "error");
    }
  }

  return (
    <div className="codex-panel">
      <div className="section-heading codex-panel-heading">
        <div>
          <p className="codex-panel-kicker">Figure Assistant</p>
          <h2>Codex Chat</h2>
        </div>
        <div className="codex-chat-actions">
          <button className="codex-header-button" onClick={() => void handleClearThread()} disabled={!activeThread || activeRunInProgress}>
            Clear
          </button>
          <button className="codex-header-button codex-header-button-danger" onClick={() => void handleDeleteThread()} disabled={!activeThread || activeRunInProgress}>
            Delete
          </button>
          <button className="codex-new-chat-button" onClick={() => void handleNewChat()} disabled={!props.activeFigure}>
            + New Chat
          </button>
        </div>
      </div>

      <div className="codex-session-bar">
        <select className="codex-session-dropdown" value={activeThreadId} onChange={(event) => void selectThread(event.target.value)} disabled={!threads.length}>
          {threads.length ? (
            threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.scope === "global" ? `${thread.title} [Global]` : thread.title}
              </option>
            ))
          ) : (
            <option value="">No chats yet</option>
          )}
        </select>
        <span className="codex-session-count">{threads.length} chat{threads.length === 1 ? "" : "s"}</span>
      </div>
      <div className="codex-session-bar">
        <span className="codex-session-count">Current figure: {currentFigureLabel}</span>
        {activeRun?.targetFigureId ? <span className="codex-session-count">Last run target: {activeRun.targetFigureId}</span> : null}
      </div>

      <div className="codex-transcript-shell">
        <div ref={transcriptRef} className="codex-transcript-inline" onScroll={() => updateAutoScrollState()}>
          {activeThread?.runs.length ? (
            activeThread.runs.map((run) => {
              const assistantMarkdown = collectAssistantMarkdown(run);
              const processing = isRunProcessing(run);
              const messageLocked = run.reviewState === "applied";
              return (
                <div key={run.id} className="codex-run-block">
                  <article className="codex-message codex-message-user">
                    <header>
                      <div className="codex-message-meta">
                        <span className="codex-message-role">You</span>
                        <time>{new Date(run.createdAt * 1000).toLocaleTimeString()}</time>
                      </div>
                      <button
                        type="button"
                        className="codex-copy-button"
                        aria-label={copiedMessageKey === `${run.id}:user` ? "Copied" : "Copy message"}
                        title={copiedMessageKey === `${run.id}:user` ? "Copied" : "Copy"}
                        onClick={() => void handleCopyMessage(`${run.id}:user`, run.prompt)}
                      >
                        <span aria-hidden="true">{copiedMessageKey === `${run.id}:user` ? "✓" : "⧉"}</span>
                      </button>
                    </header>
                    <div className="codex-message-body codex-message-body-enter">
                      <p className="codex-prompt-rendered">{renderPromptSegments(run.prompt, run.figureContext)}</p>
                    </div>
                  </article>
                  <article className="codex-message codex-message-assistant">
                    <header>
                      <div className="codex-message-meta">
                        <span className="codex-message-role">Codex</span>
                        <span>{runStatusLabel(run)}</span>
                      </div>
                      <button
                        type="button"
                        className="codex-copy-button"
                        aria-label={copiedMessageKey === `${run.id}:assistant` ? "Copied" : "Copy message"}
                        title={copiedMessageKey === `${run.id}:assistant` ? "Copied" : "Copy"}
                        onClick={() => void handleCopyMessage(`${run.id}:assistant`, assistantMarkdown)}
                      >
                        <span aria-hidden="true">{copiedMessageKey === `${run.id}:assistant` ? "✓" : "⧉"}</span>
                      </button>
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
                      <button onClick={() => setExpandedRunId(run.id)} disabled={!run.variants.length}>Enlarge</button>
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
                          {variant.latestPreviewSvg ? (
                            <SvgComparisonCard beforeSvg={run.figureContext.svg ?? ""} afterSvg={variant.latestPreviewSvg} />
                          ) : (
                            <p className="codex-muted">Waiting for a renderable SVG preview.</p>
                          )}
                          <div className="codex-variant-actions">
                            {!messageLocked && variant.reviewState === "pending" ? (
                              <>
                                <button onClick={() => void handleToggleVariantMark(variant)}>
                                  {variant.markedForRevision ? "Marked" : "Mark"}
                                </button>
                                <button onClick={() => void handleRejectVariant(variant)}>Reject</button>
                                <button onClick={() => void handleApplyVariant(variant)} disabled={variant.state !== "completed"}>Apply</button>
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

      <div
        className="codex-composer-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize prompt composer"
        title="Drag to resize the prompt composer."
        onPointerDown={(event) => {
          event.preventDefault();
          setComposerResizeState({ startY: event.clientY, startHeight: composerHeight });
        }}
      >
        <div className="codex-composer-splitter-grip" />
      </div>

      <div className="codex-composer">
        <div className="codex-composer-header">
          <label htmlFor={inputId} className="codex-eyebrow">
            Prompt
          </label>
          <span className="codex-shortcut-hint">Cmd+Enter to send</span>
        </div>
        <div className="codex-composer-shell" style={{ minHeight: `${composerHeight}px` }}>
          {hasVisualReferences ? (
            <div className="codex-reference-inline">
              <div className="codex-reference-panel-header">
                <span className="codex-eyebrow">Visual References</span>
                <span className="codex-shortcut-hint">Drag into your prompt</span>
              </div>
              <div className="codex-reference-inline-body">
                {recentReferenceTokens.length ? (
                  <div className="codex-reference-row">
                    <span className="codex-reference-label">Recent</span>
                    <div className="codex-reference-chips">
                      {recentReferenceTokens.map((token) => (
                        <button
                          key={`${token.kind}:${token.id}`}
                          type="button"
                          draggable
                          className={[
                            "codex-reference-chip",
                            token.kind === "annotation" ? "codex-reference-chip-annotation" : "",
                            token.kind === "annotation" && props.selectedCodexAnnotationId === token.id ? "active" : "",
                            token.kind === "annotation" && props.hoveredCodexAnnotationId === token.id ? "hovered" : "",
                            token.kind === "object" && (props.figureContext?.selectedIds.includes(token.id) ? "active" : ""),
                            token.kind === "object" && (props.hoveredObjectId === token.id || props.linkedObjectIds.includes(token.id)) ? "linked" : "",
                          ].filter(Boolean).join(" ")}
                          title={`Drag ${token.label} into the prompt`}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
                            event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
                          }}
                          onMouseEnter={() => {
                            if (token.kind === "annotation") {
                              props.onHoverAnnotation(token.id);
                              return;
                            }
                            props.onHoverObject(token.id);
                          }}
                          onMouseLeave={() => {
                            if (token.kind === "annotation") {
                              props.onHoverAnnotation("");
                              return;
                            }
                            props.onHoverObject("");
                          }}
                        >
                          {renderPromptTokenContent(token, referenceContext)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {referenceTokens.objects.length ? (
                  <div className="codex-reference-row">
                    <span className="codex-reference-label">Objects</span>
                    <div className="codex-reference-chips">
                      {referenceTokens.objects.map((token) => (
                        <button
                          key={token.id}
                          type="button"
                          draggable
                          className={[
                            "codex-reference-chip",
                            props.figureContext?.selectedIds.includes(token.id) ? "active" : "",
                            props.hoveredObjectId === token.id || props.linkedObjectIds.includes(token.id) ? "linked" : "",
                          ].filter(Boolean).join(" ")}
                          title={`Drag ${token.label} into the prompt`}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
                            event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
                          }}
                          onMouseEnter={() => props.onHoverObject(token.id)}
                          onMouseLeave={() => props.onHoverObject("")}
                        >
                          {renderPromptTokenContent(token, referenceContext)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {referenceTokens.annotations.length ? (
                  <div className="codex-reference-row">
                    <span className="codex-reference-label">Annotations</span>
                    <div className="codex-reference-chips">
                      {referenceTokens.annotations.map((token) => (
                        <button
                          key={token.id}
                          type="button"
                          draggable
                          className={[
                            "codex-reference-chip",
                            "codex-reference-chip-annotation",
                            props.selectedCodexAnnotationId === token.id ? "active" : "",
                            props.hoveredCodexAnnotationId === token.id ? "hovered" : "",
                          ].filter(Boolean).join(" ")}
                          title={`Drag ${token.label} into the prompt`}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
                            event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
                          }}
                          onMouseEnter={() => props.onHoverAnnotation(token.id)}
                          onMouseLeave={() => props.onHoverAnnotation("")}
                        >
                          {renderPromptTokenContent(token, referenceContext)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {commandSuggestions.length ? (
            <div className="codex-command-menu" role="listbox" aria-label="Codex commands">
              {commandSuggestions.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`codex-command-option ${index === selectedCommandIndex ? "active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setPrompt(entry.command)}
                >
                  <span className="codex-command-name">{entry.command}</span>
                  <span className="codex-command-label">{entry.label}</span>
                  <span className="codex-command-description">{entry.description}</span>
                </button>
              ))}
            </div>
          ) : null}
          <PromptEditor
            id={inputId}
            value={prompt}
            figureContext={props.figureContext}
            onChange={setPrompt}
            disabled={activeRunInProgress}
            onKeyDown={(event) => {
              if (commandSuggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                setSelectedCommandIndex((current) => {
                  if (event.key === "ArrowDown") {
                    return (current + 1) % commandSuggestions.length;
                  }
                  return (current - 1 + commandSuggestions.length) % commandSuggestions.length;
                });
                return;
              }
              if (commandSuggestions.length && event.key === "Tab") {
                event.preventDefault();
                const selection = commandSuggestions[selectedCommandIndex] ?? commandSuggestions[0];
                if (selection) {
                  if (commandSuggestions.length === 1) {
                    void executeLocalCommand(selection.id);
                  } else {
                    setPrompt(selection.command);
                  }
                }
                return;
              }
              if (commandSuggestions.length && event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
                event.preventDefault();
                const selection = commandSuggestions[selectedCommandIndex] ?? commandSuggestions[0];
                if (selection) {
                  setPrompt(selection.command);
                }
                return;
              }
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={activeRunInProgress ? "Codex is still working in this chat." : "Ask Codex about the current figure or use /global, /plan, /compact, /clear, /fig."}
          />
          <div className="codex-composer-footer">
            <div className="codex-composer-state codex-composer-state-inline">
              <div className="codex-model-meta" aria-live="polite">
                <label className="codex-inline-select">
                  <span className="sr-only">Codex model</span>
                  <select
                    className="codex-model-pill codex-pill-select"
                    value={activeModel}
                    onChange={(event) => void handleModelChange(event.target.value)}
                    disabled={isSending}
                  >
                    {CODEX_MODEL_OPTIONS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="codex-inline-select">
                  <span className="sr-only">Reasoning effort</span>
                  <select
                    className="codex-meta-chip codex-pill-select"
                    value={activeReasoningEffort}
                    onChange={(event) => void handleReasoningEffortChange(event.target.value as typeof activeReasoningEffort)}
                    disabled={isSending}
                  >
                    {REASONING_EFFORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="codex-meta-chip" title="Approximate attached context usage as a share of the model context window.">Context {contextUsagePercent}</span>
                <span
                  className="codex-meta-chip"
                  title={weeklyQuotaTokens > 0
                    ? `Local weekly usage tracked here: ${weeklyUsageTokens.toLocaleString()} / ${weeklyQuotaTokens.toLocaleString()} tokens.`
                    : "Set a weekly quota in Chat Options to see a weekly usage percentage."}
                >
                  Weekly {weeklyUsagePercent}
                </span>
                <button type="button" className="codex-meta-chip" onClick={cycleResultsCount} title="Toggle how many result options Codex should generate for new requests.">
                  Results {resultsCount}
                </button>
                {activeOptionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={`codex-option-chip codex-option-chip-${chip.replace("/", "")}`}
                    onClick={() => clearActiveOptionChip(chip)}
                    title={`Clear ${chip}`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
            <div className="codex-composer-actions">
              {activeRunInProgress ? <button onClick={() => void handleCancelRun()}>Stop</button> : null}
              <button
                className="codex-send-button"
                onClick={() => void handleSend()}
                disabled={isSending || activeRunInProgress || !props.activeFigure || (includeFigureContext && !props.figureContext)}
              >
                {activeRunInProgress ? "Running" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <details className="codex-options" open={optionsOpen} onToggle={(event) => setOptionsOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>Chat Options</summary>
        <div className="codex-thread-settings-inline codex-thread-settings-static">
          <div className="codex-static-field">
            <span>Model</span>
            <label className="codex-inline-select">
              <select
                className="codex-settings-select"
                value={activeModel}
                onChange={(event) => void handleModelChange(event.target.value)}
                disabled={isSending}
              >
                {CODEX_MODEL_OPTIONS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="codex-static-field">
            <span>Effort</span>
            <label className="codex-inline-select">
              <select
                className="codex-settings-select"
                value={activeReasoningEffort}
                onChange={(event) => void handleReasoningEffortChange(event.target.value as typeof activeReasoningEffort)}
                disabled={isSending}
              >
                {REASONING_EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="codex-static-field">
            <span>Session ID</span>
            <code>{activeThread?.codexThreadId ?? activeThread?.id ?? "Unavailable"}</code>
          </div>
          <div className="codex-static-field">
            <span>Current Figure</span>
            <code>{currentFigureLabel}</code>
          </div>
          <div className="codex-static-field">
            <span>Figure Context</span>
            <code>{includeFigureContext ? "Attached" : "Off"}</code>
          </div>
          <div className="codex-static-field">
            <span>Scope</span>
            <code>{activeThread?.scope ?? "figure"}</code>
          </div>
          <div className="codex-static-field">
            <span>Modes</span>
            <code>{[planMode ? "plan" : ""].filter(Boolean).join(", ") || "default"}</code>
          </div>
          <label className="codex-static-field codex-static-field-input">
            <span>Weekly Quota</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={weeklyQuotaTokens || ""}
              placeholder="tokens"
              onChange={(event) => setWeeklyQuotaTokens(Math.max(0, Math.round(Number(event.target.value) || 0)))}
            />
          </label>
          <div className="codex-static-field">
            <span>Results</span>
            <button onClick={cycleResultsCount}>Results {resultsCount}</button>
          </div>
        </div>
      </details>
    </div>
  );
}
