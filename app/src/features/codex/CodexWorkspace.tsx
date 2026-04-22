import { useEffect, useId, useState } from "react";

import type { CodexFigureContext, CodexRun, FigureSource } from "../../shared/types/editor";
import { copyTextToClipboard } from "./copy";
import { CodexComposer } from "./CodexComposer";
import { CodexOptionsPanel } from "./CodexOptionsPanel";
import { CodexTranscript } from "./CodexTranscript";
import { useCodexReferenceTokens } from "./useCodexReferenceTokens";
import { useCodexWorkspace } from "./useCodexWorkspace";

type CodexGalleryActionDetail = {
  action: "apply" | "reject" | "mark" | "close" | "tune";
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
  const workspace = useCodexWorkspace(props);
  const referenceState = useCodexReferenceTokens({
    activeThread: workspace.activeThread,
    figureContext: props.figureContext,
  });
  const expandedRun = workspace.activeThread?.runs.find((run) => run.id === expandedRunId) ?? null;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<CodexGallerySyncDetail>("paper_figures:codex_gallery_sync", { detail: { run: expandedRun } }));
  }, [expandedRun]);

  useEffect(() => {
    setExpandedRunId("");
  }, [workspace.activeThreadId]);

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
        void workspace.handleApplyVariant(variant).then(() => setExpandedRunId(""));
        return;
      }
      if (detail.action === "reject") {
        void workspace.handleRejectVariant(variant);
        return;
      }
      if (detail.action === "tune") {
        window.dispatchEvent(new CustomEvent("paper_figures:codex_variant_focus", { detail: { run: expandedRun, variant } }));
        return;
      }
      void workspace.handleToggleVariantMark(variant);
    };
    window.addEventListener("paper_figures:codex_gallery_action", onGalleryAction as EventListener);
    return () => window.removeEventListener("paper_figures:codex_gallery_action", onGalleryAction as EventListener);
  }, [expandedRun, workspace.handleApplyVariant, workspace.handleRejectVariant, workspace.handleToggleVariantMark]);

  async function handleCopyMessage(messageKey: string, text: string): Promise<void> {
    try {
      await copyTextToClipboard(text);
      workspace.setCopiedMessageKey(messageKey);
      window.setTimeout(() => {
        workspace.setCopiedMessageKey((current) => (current === messageKey ? "" : current));
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
          <button className="codex-header-button" onClick={() => void workspace.handleClearThread()} disabled={!workspace.activeThread || workspace.activeRunInProgress}>
            Clear
          </button>
          <button className="codex-header-button codex-header-button-danger" onClick={() => void workspace.handleDeleteThread()} disabled={!workspace.activeThread || workspace.activeRunInProgress}>
            Delete
          </button>
          <button className="codex-new-chat-button" onClick={() => void workspace.handleNewChat()} disabled={!props.activeFigure}>
            + New Chat
          </button>
        </div>
      </div>

      <div className="codex-session-bar">
        <select className="codex-session-dropdown" value={workspace.activeThreadId} onChange={(event) => void workspace.selectThread(event.target.value)} disabled={!workspace.threads.length}>
          {workspace.threads.length ? (
            workspace.threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.scope === "global" ? `${thread.title} [Global]` : thread.title}
              </option>
            ))
          ) : (
            <option value="">No chats yet</option>
          )}
        </select>
        <span className="codex-session-count">{workspace.threads.length} chat{workspace.threads.length === 1 ? "" : "s"}</span>
      </div>
      <div className="codex-session-bar">
        <span className="codex-session-count">Current figure: {workspace.currentFigureLabel}</span>
        {workspace.activeRun?.targetFigureId ? <span className="codex-session-count">Last run target: {workspace.activeRun.targetFigureId}</span> : null}
      </div>

      <CodexTranscript
        activeThread={workspace.activeThread}
        figureContext={props.figureContext}
        transcriptRef={workspace.transcriptRef}
        copiedMessageKey={workspace.copiedMessageKey}
        selectedState={{
          selectedCodexAnnotationId: props.selectedCodexAnnotationId,
          hoveredCodexAnnotationId: props.hoveredCodexAnnotationId,
          linkedObjectIds: props.linkedObjectIds,
          hoveredObjectId: props.hoveredObjectId,
        }}
        hoverHandlers={{
          onHoverAnnotation: props.onHoverAnnotation,
          onHoverObject: props.onHoverObject,
        }}
        onScroll={workspace.updateAutoScrollState}
        onCopyMessage={handleCopyMessage}
        onExpandRun={setExpandedRunId}
        onApplyVariant={workspace.handleApplyVariant}
        onRejectVariant={workspace.handleRejectVariant}
        onToggleVariantMark={workspace.handleToggleVariantMark}
      />

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

      <CodexComposer
        inputId={inputId}
        composerHeight={composerHeight}
        prompt={workspace.prompt}
        figureContext={props.figureContext}
        activeRunInProgress={workspace.activeRunInProgress}
        commandSuggestions={workspace.commandSuggestions}
        selectedCommandIndex={workspace.selectedCommandIndex}
        setSelectedCommandIndex={workspace.setSelectedCommandIndex}
        setPrompt={workspace.setPrompt}
        executeLocalCommand={workspace.executeLocalCommand}
        handleSend={workspace.handleSend}
        handleCancelRun={workspace.handleCancelRun}
        activeModel={workspace.activeModel}
        activeReasoningEffort={workspace.activeReasoningEffort}
        isSending={workspace.isSending}
        contextUsagePercent={workspace.contextUsagePercent}
        weeklyUsageTokens={workspace.weeklyUsageTokens}
        weeklyQuotaTokens={workspace.weeklyQuotaTokens}
        weeklyUsagePercent={workspace.weeklyUsagePercent}
        resultsCount={workspace.resultsCount}
        activeOptionChips={workspace.activeOptionChips}
        includeFigureContext={workspace.includeFigureContext}
        activeFigureReady={Boolean(props.activeFigure)}
        onModelChange={workspace.handleModelChange}
        onReasoningEffortChange={workspace.handleReasoningEffortChange}
        onCycleResultsCount={workspace.cycleResultsCount}
        onClearOptionChip={workspace.clearActiveOptionChip}
        referenceState={referenceState}
        selectedState={{
          selectedCodexAnnotationId: props.selectedCodexAnnotationId,
          hoveredCodexAnnotationId: props.hoveredCodexAnnotationId,
          linkedObjectIds: props.linkedObjectIds,
          hoveredObjectId: props.hoveredObjectId,
        }}
        hoverHandlers={{
          onHoverAnnotation: props.onHoverAnnotation,
          onHoverObject: props.onHoverObject,
        }}
      />

      <CodexOptionsPanel
        optionsOpen={workspace.optionsOpen}
        activeThread={workspace.activeThread}
        activeModel={workspace.activeModel}
        activeReasoningEffort={workspace.activeReasoningEffort}
        currentFigureLabel={workspace.currentFigureLabel}
        includeFigureContext={workspace.includeFigureContext}
        planMode={workspace.planMode}
        weeklyQuotaTokens={workspace.weeklyQuotaTokens}
        resultsCount={workspace.resultsCount}
        isSending={workspace.isSending}
        onOptionsOpenChange={workspace.setOptionsOpen}
        onModelChange={workspace.handleModelChange}
        onReasoningEffortChange={workspace.handleReasoningEffortChange}
        onWeeklyQuotaChange={workspace.setWeeklyQuotaTokens}
        onCycleResultsCount={workspace.cycleResultsCount}
      />
    </div>
  );
}
