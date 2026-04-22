import { useMemo, useState } from "react";

import {
  applyCodexVariant,
  cancelCodexRun,
  clearCodexThread,
  createCodexRun,
  createCodexThread,
  deleteCodexThread,
  fetchCodexThread,
  fetchCodexThreads,
  markCodexVariant,
  rejectCodexVariant,
  updateCodexThread,
} from "../../shared/api/codex";
import type { CodexFigureContext, CodexReasoningEffort, CodexRunVariant, FigureSource } from "../../shared/types/editor";
import { DEFAULT_CODEX_MODEL, DEFAULT_REASONING_EFFORT, FIXED_CODEX_APPROVAL, FIXED_CODEX_SANDBOX, type SlashCommandId } from "./codexConfig";
import { EMPTY_FIGURE_CONTEXT } from "./codexContext";
import { useCodexComposerState, extractInlineSlashCommands } from "./useCodexComposerState";
import { useCodexThreads } from "./useCodexThreads";

export { CODEX_MODEL_OPTIONS } from "./codexConfig";
export type { SlashCommandId } from "./codexConfig";

export function useCodexWorkspace(config: {
  activeFigure: FigureSource | null;
  figureContext: CodexFigureContext | null;
  onStatus: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const { activeFigure, figureContext, onStatus } = config;
  const threadState = useCodexThreads({ onStatus });
  const composerState = useCodexComposerState({
    figureContext,
    threads: threadState.threads,
  });
  const [isSending, setIsSending] = useState(false);

  const markedVariantIds = threadState.activeRun?.reviewState !== "applied"
    ? threadState.activeRun?.variants.filter((variant) => variant.markedForRevision).map((variant) => variant.id) ?? []
    : [];
  const activeModel = threadState.activeThread?.model || composerState.preferredModel || DEFAULT_CODEX_MODEL;
  const activeReasoningEffort = threadState.activeThread?.reasoningEffort || composerState.preferredReasoningEffort || DEFAULT_REASONING_EFFORT;
  const currentFigureLabel = activeFigure?.figure.title ?? activeFigure?.figure.id ?? "No figure";

  const workspaceState = useMemo(() => ({
    threads: threadState.threads,
    activeThreadId: threadState.activeThreadId,
    activeThread: threadState.activeThread,
    activeRun: threadState.activeRun,
    activeRunInProgress: threadState.activeRunInProgress,
    prompt: composerState.prompt,
    isSending,
    optionsOpen: composerState.optionsOpen,
    copiedMessageKey: composerState.copiedMessageKey,
    selectedCommandIndex: composerState.selectedCommandIndex,
    commandSuggestions: composerState.commandSuggestions,
    contextUsagePercent: composerState.contextUsagePercent,
    weeklyUsageTokens: composerState.weeklyUsageTokens,
    weeklyQuotaTokens: composerState.weeklyQuotaTokens,
    weeklyUsagePercent: composerState.weeklyUsagePercent,
    activeOptionChips: composerState.activeOptionChips,
    transcriptRef: threadState.transcriptRef,
    includeFigureContext: composerState.includeFigureContext,
    currentFigureLabel,
    planMode: composerState.planMode,
    resultsCount: composerState.resultsCount,
    activeModel,
    activeReasoningEffort,
  }), [
    activeModel,
    activeReasoningEffort,
    composerState.activeOptionChips,
    composerState.commandSuggestions,
    composerState.contextUsagePercent,
    composerState.copiedMessageKey,
    composerState.includeFigureContext,
    composerState.optionsOpen,
    composerState.planMode,
    composerState.prompt,
    composerState.resultsCount,
    composerState.selectedCommandIndex,
    composerState.weeklyQuotaTokens,
    composerState.weeklyUsagePercent,
    composerState.weeklyUsageTokens,
    currentFigureLabel,
    isSending,
    threadState.activeRun,
    threadState.activeRunInProgress,
    threadState.activeThread,
    threadState.activeThreadId,
    threadState.threads,
    threadState.transcriptRef,
  ]);

  async function handleNewChat(): Promise<boolean> {
    if (!activeFigure) {
      onStatus("Open a figure before creating a Codex chat.", "error");
      return false;
    }
    try {
      const payload = await createCodexThread({
        figureId: activeFigure.figure.id,
        scope: "figure",
        title: `${activeFigure.figure.title} session ${threadState.threads.length + 1}`,
        model: composerState.preferredModel,
        reasoningEffort: composerState.preferredReasoningEffort,
        sandboxMode: FIXED_CODEX_SANDBOX,
        approvalPolicy: FIXED_CODEX_APPROVAL,
      });
      threadState.setThreads((current) => [payload.thread, ...current]);
      threadState.setActiveThreadId(payload.thread.id);
      return true;
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to create Codex chat.", "error");
      return false;
    }
  }

  async function handleGlobalChat(): Promise<void> {
    const existing = threadState.threads.find((thread) => thread.scope === "global") ?? null;
    if (existing) {
      await threadState.selectThread(existing.id);
      onStatus(`Switched to global workspace chat "${existing.title}".`, "info");
      composerState.clearPrompt();
      return;
    }
    if (!activeFigure) {
      onStatus("Open a figure before creating a global Codex chat.", "error");
      return;
    }
    try {
      const payload = await createCodexThread({
        figureId: activeFigure.figure.id,
        scope: "global",
        title: `Global workspace session ${threadState.threads.filter((thread) => thread.scope === "global").length + 1}`,
        model: composerState.preferredModel,
        reasoningEffort: composerState.preferredReasoningEffort,
        sandboxMode: FIXED_CODEX_SANDBOX,
        approvalPolicy: FIXED_CODEX_APPROVAL,
      });
      threadState.setThreads((current) => [payload.thread, ...current]);
      threadState.setActiveThreadId(payload.thread.id);
      composerState.clearPrompt();
      onStatus("Created a global workspace chat staged with all figures.", "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to create a global Codex chat.", "error");
    }
  }

  async function handleClearThread(): Promise<void> {
    if (!threadState.activeThread) {
      onStatus("Select a Codex chat before clearing it.", "info");
      return;
    }
    try {
      const payload = await clearCodexThread(threadState.activeThread.id);
      threadState.replaceThread(payload.thread);
      composerState.clearPrompt();
      onStatus("Cleared the current Codex chat.", "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to clear the current chat.", "error");
    }
  }

  async function handleDeleteThread(): Promise<void> {
    if (!threadState.activeThread) {
      onStatus("Select a Codex chat before deleting it.", "info");
      return;
    }
    if (!window.confirm(`Delete chat "${threadState.activeThread.title}"?`)) {
      return;
    }
    try {
      await deleteCodexThread(threadState.activeThread.id);
      const remaining = threadState.threads.filter((thread) => thread.id !== threadState.activeThread?.id);
      threadState.setThreads(remaining);
      threadState.setActiveThreadId(remaining[0]?.id ?? "");
      composerState.clearPrompt();
      onStatus("Deleted the selected Codex chat.", "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to delete the selected chat.", "error");
    }
  }

  async function executeLocalCommand(commandId: SlashCommandId, options?: { clearPrompt?: boolean }): Promise<void> {
    const clearPrompt = options?.clearPrompt ?? true;
    if (commandId === "clear") {
      if (clearPrompt) {
        composerState.clearPrompt();
      }
      await handleClearThread();
      return;
    }
    if (commandId === "global") {
      await handleGlobalChat();
      return;
    }
    if (commandId === "plan") {
      composerState.setPlanMode((current) => {
        const next = !current;
        onStatus(next ? "Plan mode enabled." : "Plan mode disabled.", "info");
        return next;
      });
      if (clearPrompt) {
        composerState.clearPrompt();
      }
      return;
    }
    if (commandId === "compact") {
      if (clearPrompt) {
        composerState.clearPrompt();
      }
      await handleClearThread();
      onStatus("Compacted the current Codex chat session.", "success");
      return;
    }
    composerState.setIncludeFigureContext((current) => {
      const next = !current;
      onStatus(next ? "Figure context will be attached." : "Figure context attachment is off.", "info");
      return next;
    });
    if (clearPrompt) {
      composerState.clearPrompt();
    }
  }

  async function applyInlineCommands(commands: SlashCommandId[], clearPrompt = false): Promise<void> {
    for (const commandId of commands) {
      await executeLocalCommand(commandId, { clearPrompt: false });
    }
    if (clearPrompt) {
      composerState.clearPrompt();
    }
  }

  async function handleSend(): Promise<void> {
    const { commands: inlineCommands, prompt: strippedPrompt } = extractInlineSlashCommands(composerState.prompt);
    const hasOnlyCommands = inlineCommands.length > 0 && !strippedPrompt;
    if ((!composerState.trimmedPrompt && !inlineCommands.length) || threadState.activeRunInProgress) {
      return;
    }
    if (hasOnlyCommands) {
      await applyInlineCommands(inlineCommands, true);
      return;
    }
    let thread = threadState.activeThread;
    setIsSending(true);
    try {
      await applyInlineCommands(inlineCommands);
      if (inlineCommands.includes("global")) {
        const payload = await fetchCodexThreads();
        threadState.setThreads(payload.threads);
        thread = payload.threads.find((entry) => entry.scope === "global") ?? payload.threads[0] ?? null;
        if (thread) {
          threadState.setActiveThreadId(thread.id);
        }
      }
      if (!thread) {
        await handleNewChat();
        const payload = await fetchCodexThreads();
        thread = payload.threads[0] ?? null;
        threadState.setThreads(payload.threads);
        if (thread) {
          threadState.setActiveThreadId(thread.id);
        }
      }
      if (!thread) {
        throw new Error("No Codex chat is available.");
      }
      const promptPrefix: string[] = [];
      if (composerState.planMode) {
        promptPrefix.push("Respond in planning mode. Start with a concise step-by-step plan before details.");
      }
      const effectivePrompt = strippedPrompt || composerState.trimmedPrompt;
      const runPrompt = promptPrefix.length ? `${promptPrefix.join("\n")}\n\n${effectivePrompt}` : effectivePrompt;
      await createCodexRun(thread.id, {
        activeFigureId: activeFigure?.figure.id ?? "",
        resultsCount: composerState.resultsCount,
        revisionVariantIds: markedVariantIds,
        prompt: runPrompt,
        figureContext: composerState.includeFigureContext ? (figureContext ?? EMPTY_FIGURE_CONTEXT) : EMPTY_FIGURE_CONTEXT,
      });
      const refreshed = await fetchCodexThread(thread.id);
      threadState.replaceThread(refreshed.thread);
      composerState.clearPrompt();
    } catch (error) {
      if (error instanceof Error && error.message.includes("already has an active run") && thread) {
        const refreshed = await fetchCodexThread(thread.id).catch(() => null);
        if (refreshed) {
          threadState.replaceThread(refreshed.thread);
          onStatus("This chat already has an active Codex run. Stop it or wait for it to finish.", "info");
          return;
        }
      }
      onStatus(error instanceof Error ? error.message : "Failed to start Codex run.", "error");
    } finally {
      setIsSending(false);
    }
  }

  async function handleCancelRun(): Promise<void> {
    if (!threadState.activeRun || !threadState.activeThread) {
      return;
    }
    const payload = await cancelCodexRun(threadState.activeRun.id);
    threadState.replaceRun(payload.run);
  }

  async function handleApplyVariant(variant: CodexRunVariant): Promise<void> {
    if (!threadState.activeRun || !threadState.activeThread) {
      return;
    }
    const payload = await applyCodexVariant(variant.id);
    threadState.dispatchRunRefresh(payload.run);
    threadState.replaceRun(payload.run);
    onStatus(`Applied ${variant.label}.`, "success");
  }

  async function handleRejectVariant(variant: CodexRunVariant): Promise<void> {
    if (!threadState.activeRun || !threadState.activeThread) {
      return;
    }
    const payload = await rejectCodexVariant(variant.id);
    threadState.dispatchRunRefresh(payload.run);
    threadState.replaceRun(payload.run);
    onStatus(`Rejected ${variant.label}.`, "info");
  }

  async function handleToggleVariantMark(variant: CodexRunVariant): Promise<void> {
    if (!threadState.activeRun || !threadState.activeThread || threadState.activeRun.reviewState === "applied") {
      return;
    }
    const payload = await markCodexVariant(variant.id, !variant.markedForRevision);
    threadState.dispatchRunRefresh(payload.run);
    threadState.replaceRun(payload.run);
    onStatus(`${variant.markedForRevision ? "Unmarked" : "Marked"} ${variant.label} for the next revision round.`, "info");
  }

  async function handleModelChange(nextModel: string): Promise<void> {
    composerState.setPreferredModel(nextModel);
    if (!threadState.activeThread) {
      onStatus(`Default model set to ${nextModel}.`, "info");
      return;
    }
    try {
      const payload = await updateCodexThread(threadState.activeThread.id, { model: nextModel });
      threadState.replaceThread(payload.thread);
      onStatus(`Model set to ${nextModel} for this chat.`, "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to update Codex model.", "error");
    }
  }

  async function handleReasoningEffortChange(nextEffort: CodexReasoningEffort): Promise<void> {
    composerState.setPreferredReasoningEffort(nextEffort);
    if (!threadState.activeThread) {
      onStatus(`Default effort set to ${nextEffort}.`, "info");
      return;
    }
    try {
      const payload = await updateCodexThread(threadState.activeThread.id, { reasoningEffort: nextEffort });
      threadState.replaceThread(payload.thread);
      onStatus(`Effort set to ${nextEffort} for this chat.`, "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to update Codex effort.", "error");
    }
  }

  return {
    ...workspaceState,
    setPrompt: composerState.setPrompt,
    setOptionsOpen: composerState.setOptionsOpen,
    setCopiedMessageKey: composerState.setCopiedMessageKey,
    setSelectedCommandIndex: composerState.setSelectedCommandIndex,
    updateAutoScrollState: threadState.updateAutoScrollState,
    selectThread: threadState.selectThread,
    handleNewChat,
    handleClearThread,
    handleDeleteThread,
    handleSend,
    handleCancelRun,
    handleApplyVariant,
    handleRejectVariant,
    handleToggleVariantMark,
    executeLocalCommand,
    clearActiveOptionChip: (chip: string) => composerState.clearActiveOptionChip(chip, onStatus),
    cycleResultsCount: composerState.cycleResultsCount,
    setWeeklyQuotaTokens: composerState.setWeeklyQuotaTokens,
    handleModelChange,
    handleReasoningEffortChange,
  };
}
