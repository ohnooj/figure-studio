import { useEffect, useRef, useState } from "react";

import {
  cancelCodexRun,
  clearCodexThread,
  createCodexRun,
  createCodexThread,
  deleteCodexThread,
  fetchCodexRun,
  fetchCodexThread,
  fetchCodexThreads,
  applyCodexVariant,
  mergeCodexRunEvents,
  markCodexVariant,
  openCodexRunEventSource,
  rejectCodexVariant,
  updateCodexThread,
} from "../../shared/api/codex";
import type { CodexFigureContext, CodexReasoningEffort, CodexRunEvent, CodexRunVariant, CodexThread, FigureSource } from "../../shared/types/editor";
import { EMPTY_FIGURE_CONTEXT } from "./codexContext";
import { estimateTokenCount, estimateWeeklyUsage, formatPercent, isRunProcessing } from "./codexFormatting";

export const CODEX_MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
] as const;
const DEFAULT_CODEX_MODEL = "gpt-5.4";
const DEFAULT_REASONING_EFFORT: CodexReasoningEffort = "medium";
const FIXED_CODEX_SANDBOX = "workspace-write";
const FIXED_CODEX_APPROVAL = "never";
const MODEL_CONTEXT_TOKENS = 272_000;

export const SLASH_COMMANDS = [
  { id: "plan", command: "/plan", label: "Plan mode", description: "Toggle planning-first replies." },
  { id: "compact", command: "/compact", label: "Compact session", description: "Compact the current chat session history." },
  { id: "global", command: "/global", label: "Global workspace", description: "Switch to a chat staged with all figures in the workspace." },
  { id: "clear", command: "/clear", label: "Clear chat", description: "Reset the current chat context and history." },
  { id: "fig", command: "/fig", label: "Figure context", description: "Toggle figure context attachment." },
] as const;

export type SlashCommandId = (typeof SLASH_COMMANDS)[number]["id"];

const INLINE_COMMAND_PATTERN = /(^|\s)(\/(plan|compact|global|clear|fig))(?=\s|$)/gi;

function extractInlineSlashCommands(value: string): { commands: SlashCommandId[]; prompt: string } {
  const commands: SlashCommandId[] = [];
  const prompt = value
    .replace(INLINE_COMMAND_PATTERN, (match, leadingWhitespace: string, _fullCommand: string, commandId: string) => {
      commands.push(commandId as SlashCommandId);
      return leadingWhitespace;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { commands, prompt };
}

export function useCodexWorkspace(config: {
  activeFigure: FigureSource | null;
  figureContext: CodexFigureContext | null;
  onStatus: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const { activeFigure, figureContext, onStatus } = config;
  const [threads, setThreads] = useState<CodexThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState("");
  const [includeFigureContext, setIncludeFigureContext] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [weeklyQuotaTokens, setWeeklyQuotaTokens] = useState(0);
  const [resultsCount, setResultsCount] = useState(1);
  const [preferredModel, setPreferredModel] = useState<string>(DEFAULT_CODEX_MODEL);
  const [preferredReasoningEffort, setPreferredReasoningEffort] = useState<CodexReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const activeRun = activeThread?.runs[activeThread.runs.length - 1] ?? null;
  const activeRunInProgress = Boolean(activeRun && isRunProcessing(activeRun));
  const activeThreadIdForRun = activeThread?.id ?? "";
  const activeRunId = activeRun?.id ?? "";
  const activeModel = activeThread?.model || preferredModel;
  const activeReasoningEffort = activeThread?.reasoningEffort || preferredReasoningEffort;
  const currentFigureLabel = activeFigure?.figure.title ?? activeFigure?.figure.id ?? "No figure";
  const markedVariantIds = activeRun?.reviewState !== "applied"
    ? activeRun?.variants.filter((variant) => variant.markedForRevision).map((variant) => variant.id) ?? []
    : [];
  const trimmedPrompt = prompt.trim();
  const trailingCommandMatch = prompt.match(/(?:^|\s)\/([a-z]*)$/i);
  const commandFragment = trailingCommandMatch?.[1]?.toLowerCase() ?? "";
  const commandSuggestions = commandFragment
    ? SLASH_COMMANDS.filter((entry) => entry.id.startsWith(commandFragment))
    : prompt.endsWith("/")
      ? [...SLASH_COMMANDS]
      : [];
  const attachedContextTokens = includeFigureContext && figureContext
    ? estimateTokenCount(JSON.stringify(figureContext))
    : 0;
  const contextUsagePercent = formatPercent((attachedContextTokens / MODEL_CONTEXT_TOKENS) * 100);
  const weeklyUsageTokens = estimateWeeklyUsage(threads);
  const weeklyUsagePercent = weeklyQuotaTokens > 0 ? formatPercent((weeklyUsageTokens / weeklyQuotaTokens) * 100) : "Set";
  const activeOptionChips = [
    planMode ? "/plan" : "",
    includeFigureContext ? "/fig" : "",
  ].filter(Boolean);
  const transcriptSignature = activeThread?.runs
    .map((run) => `${run.id}:${run.updatedAt}:${run.events.length}:${run.state}:${run.reviewState}:${run.variants.map((variant) => `${variant.id}:${variant.state}:${variant.reviewState}:${variant.markedForRevision}:${variant.updatedAt}`).join(",")}`)
    .join("|") ?? "";

  function updateAutoScrollState(): void {
    const element = transcriptRef.current;
    if (!(element instanceof HTMLElement)) {
      shouldAutoScrollRef.current = true;
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 24;
  }

  useEffect(() => {
    const savedQuota = Number(window.localStorage.getItem("paper_figures.codexWeeklyQuotaTokens"));
    if (Number.isFinite(savedQuota) && savedQuota > 0) {
      setWeeklyQuotaTokens(Math.round(savedQuota));
    }
    const savedResultsCount = Number(window.localStorage.getItem("paper_figures.codexResultsCount"));
    if (Number.isFinite(savedResultsCount) && savedResultsCount >= 1 && savedResultsCount <= 3) {
      setResultsCount(Math.round(savedResultsCount));
    }
    const savedModel = window.localStorage.getItem("paper_figures.codexPreferredModel");
    if (savedModel && CODEX_MODEL_OPTIONS.includes(savedModel as (typeof CODEX_MODEL_OPTIONS)[number])) {
      setPreferredModel(savedModel);
    }
    const savedReasoningEffort = window.localStorage.getItem("paper_figures.codexPreferredReasoningEffort");
    if (savedReasoningEffort === "low" || savedReasoningEffort === "medium" || savedReasoningEffort === "high" || savedReasoningEffort === "xhigh") {
      setPreferredReasoningEffort(savedReasoningEffort);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchCodexThreads();
        if (cancelled) {
          return;
        }
        setThreads(payload.threads);
        const nextThread = payload.threads.find((thread) => thread.id === activeThreadId) ?? payload.threads[0] ?? null;
        if (nextThread) {
          setActiveThreadId(nextThread.id);
        }
      } catch (error) {
        onStatus(error instanceof Error ? error.message : "Failed to load Codex chats.", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, onStatus]);

  useEffect(() => {
    if (weeklyQuotaTokens > 0) {
      window.localStorage.setItem("paper_figures.codexWeeklyQuotaTokens", String(Math.round(weeklyQuotaTokens)));
      return;
    }
    window.localStorage.removeItem("paper_figures.codexWeeklyQuotaTokens");
  }, [weeklyQuotaTokens]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.codexResultsCount", String(resultsCount));
  }, [resultsCount]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.codexPreferredModel", preferredModel);
  }, [preferredModel]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.codexPreferredReasoningEffort", preferredReasoningEffort);
  }, [preferredReasoningEffort]);

  useEffect(() => {
    if (!activeRunId || !activeThreadIdForRun || !activeRunInProgress) {
      return;
    }
    const source = openCodexRunEventSource(activeRunId);
    source.addEventListener("message", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as CodexRunEvent;
      setThreads((current) =>
        current.map((thread) =>
          thread.id !== activeThreadIdForRun
            ? thread
            : {
                ...thread,
                runs: thread.runs.map((run) =>
                  run.id === activeRunId ? { ...run, events: mergeCodexRunEvents(run.events, [payload]) } : run,
                ),
              },
        ),
      );
      if (
        payload.type === "codex.turn.diff.updated"
        || payload.type === "codex.turn.completed"
        || payload.type === "codex.error"
        || payload.type === "run.applied"
        || payload.type === "variant.rejected"
        || payload.type === "variant.marked"
      ) {
        void fetchCodexRun(activeRunId)
          .then((response) => {
            setThreads((current) =>
              current.map((thread) =>
                thread.id !== activeThreadIdForRun
                  ? thread
                  : {
                      ...thread,
                      runs: thread.runs.map((run) => (run.id === response.run.id ? response.run : run)),
                    },
              ),
            );
          })
          .catch(() => undefined);
      }
    });
    return () => source.close();
  }, [activeRunId, activeRunInProgress, activeThreadIdForRun]);

  useEffect(() => {
    const element = transcriptRef.current;
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.scrollTop = element.scrollHeight;
    shouldAutoScrollRef.current = true;
  }, [activeThreadId]);

  useEffect(() => {
    const element = transcriptRef.current;
    if (!(element instanceof HTMLElement) || !shouldAutoScrollRef.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [transcriptSignature]);

  useEffect(() => {
    setSelectedCommandIndex((current) => {
      if (!commandSuggestions.length) {
        return 0;
      }
      return Math.min(current, commandSuggestions.length - 1);
    });
  }, [commandSuggestions]);

  async function selectThread(threadId: string): Promise<void> {
    try {
      const payload = await fetchCodexThread(threadId);
      setThreads((current) => current.map((thread) => (thread.id === payload.thread.id ? payload.thread : thread)));
      setActiveThreadId(threadId);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to open Codex chat.", "error");
    }
  }

  async function handleNewChat(): Promise<boolean> {
    if (!activeFigure) {
      onStatus("Open a figure before creating a Codex chat.", "error");
      return false;
    }
    try {
      const payload = await createCodexThread({
        figureId: activeFigure.figure.id,
        scope: "figure",
        title: `${activeFigure.figure.title} session ${threads.length + 1}`,
        model: preferredModel,
        reasoningEffort: preferredReasoningEffort,
        sandboxMode: FIXED_CODEX_SANDBOX,
        approvalPolicy: FIXED_CODEX_APPROVAL,
      });
      setThreads((current) => [payload.thread, ...current]);
      setActiveThreadId(payload.thread.id);
      return true;
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to create Codex chat.", "error");
      return false;
    }
  }

  async function handleGlobalChat(): Promise<void> {
    const existing = threads.find((thread) => thread.scope === "global") ?? null;
    if (existing) {
      await selectThread(existing.id);
      onStatus(`Switched to global workspace chat "${existing.title}".`, "info");
      setPrompt("");
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
        title: `Global workspace session ${threads.filter((thread) => thread.scope === "global").length + 1}`,
        model: preferredModel,
        reasoningEffort: preferredReasoningEffort,
        sandboxMode: FIXED_CODEX_SANDBOX,
        approvalPolicy: FIXED_CODEX_APPROVAL,
      });
      setThreads((current) => [payload.thread, ...current]);
      setActiveThreadId(payload.thread.id);
      setPrompt("");
      onStatus("Created a global workspace chat staged with all figures.", "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to create a global Codex chat.", "error");
    }
  }

  function cycleResultsCount(): void {
    setResultsCount((current) => (current >= 3 ? 1 : current + 1));
  }

  async function handleClearThread(): Promise<void> {
    if (!activeThread) {
      onStatus("Select a Codex chat before clearing it.", "info");
      return;
    }
    try {
      const payload = await clearCodexThread(activeThread.id);
      setThreads((current) => current.map((thread) => (thread.id === payload.thread.id ? payload.thread : thread)));
      setPrompt("");
      onStatus("Cleared the current Codex chat.", "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to clear the current chat.", "error");
    }
  }

  async function handleDeleteThread(): Promise<void> {
    if (!activeThread) {
      onStatus("Select a Codex chat before deleting it.", "info");
      return;
    }
    if (!window.confirm(`Delete chat "${activeThread.title}"?`)) {
      return;
    }
    try {
      await deleteCodexThread(activeThread.id);
      const remaining = threads.filter((thread) => thread.id !== activeThread.id);
      setThreads(remaining);
      setActiveThreadId(remaining[0]?.id ?? "");
      setPrompt("");
      onStatus("Deleted the selected Codex chat.", "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to delete the selected chat.", "error");
    }
  }

  async function executeLocalCommand(commandId: SlashCommandId, options?: { clearPrompt?: boolean }): Promise<void> {
    const clearPrompt = options?.clearPrompt ?? true;
    if (commandId === "clear") {
      if (clearPrompt) {
        setPrompt("");
      }
      await handleClearThread();
      return;
    }
    if (commandId === "global") {
      await handleGlobalChat();
      return;
    }
    if (commandId === "plan") {
      setPlanMode((current) => {
        const next = !current;
        onStatus(next ? "Plan mode enabled." : "Plan mode disabled.", "info");
        return next;
      });
      if (clearPrompt) {
        setPrompt("");
      }
      return;
    }
    if (commandId === "compact") {
      if (clearPrompt) {
        setPrompt("");
      }
      await handleClearThread();
      onStatus("Compacted the current Codex chat session.", "success");
      return;
    }
    setIncludeFigureContext((current) => {
      const next = !current;
      onStatus(next ? "Figure context will be attached." : "Figure context attachment is off.", "info");
      return next;
    });
    if (clearPrompt) {
      setPrompt("");
    }
  }

  async function applyInlineCommands(commands: SlashCommandId[], clearPrompt = false): Promise<void> {
    for (const commandId of commands) {
      await executeLocalCommand(commandId, { clearPrompt: false });
    }
    if (clearPrompt) {
      setPrompt("");
    }
  }

  function clearActiveOptionChip(chip: string): void {
    if (chip === "/plan") {
      setPlanMode(false);
      onStatus("Plan mode disabled.", "info");
      return;
    }
    setIncludeFigureContext(false);
    onStatus("Figure context attachment is off.", "info");
  }

  async function handleSend(): Promise<void> {
    const { commands: inlineCommands, prompt: strippedPrompt } = extractInlineSlashCommands(prompt);
    const hasOnlyCommands = inlineCommands.length > 0 && !strippedPrompt;
    if ((!trimmedPrompt && !inlineCommands.length) || activeRunInProgress) {
      return;
    }
    if (hasOnlyCommands) {
      await applyInlineCommands(inlineCommands, true);
      return;
    }
    let thread = activeThread;
    setIsSending(true);
    try {
      await applyInlineCommands(inlineCommands);
      if (inlineCommands.includes("global")) {
        const payload = await fetchCodexThreads();
        setThreads(payload.threads);
        thread = payload.threads.find((entry) => entry.scope === "global") ?? payload.threads[0] ?? null;
        if (thread) {
          setActiveThreadId(thread.id);
        }
      }
      if (!thread) {
        await handleNewChat();
        const payload = await fetchCodexThreads();
        thread = payload.threads[0] ?? null;
        setThreads(payload.threads);
        if (thread) {
          setActiveThreadId(thread.id);
        }
      }
      if (!thread) {
        throw new Error("No Codex chat is available.");
      }
      const promptPrefix: string[] = [];
      if (planMode) {
        promptPrefix.push("Respond in planning mode. Start with a concise step-by-step plan before details.");
      }
      const effectivePrompt = strippedPrompt || trimmedPrompt;
      const runPrompt = promptPrefix.length ? `${promptPrefix.join("\n")}\n\n${effectivePrompt}` : effectivePrompt;
      await createCodexRun(thread.id, {
        activeFigureId: activeFigure?.figure.id ?? "",
        resultsCount,
        revisionVariantIds: markedVariantIds,
        prompt: runPrompt,
        figureContext: includeFigureContext ? (figureContext ?? EMPTY_FIGURE_CONTEXT) : EMPTY_FIGURE_CONTEXT,
      });
      const refreshed = await fetchCodexThread(thread.id);
      setThreads((current) => current.map((entry) => (entry.id === refreshed.thread.id ? refreshed.thread : entry)));
      setPrompt("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("already has an active run") && thread) {
        const refreshed = await fetchCodexThread(thread.id).catch(() => null);
        if (refreshed) {
          setThreads((current) => current.map((entry) => (entry.id === refreshed.thread.id ? refreshed.thread : entry)));
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
    if (!activeRun || !activeThread) {
      return;
    }
    const payload = await cancelCodexRun(activeRun.id);
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== activeThread.id ? thread : { ...thread, runs: thread.runs.map((run) => (run.id === payload.run.id ? payload.run : run)) },
      ),
    );
  }

  async function handleApplyVariant(variant: CodexRunVariant): Promise<void> {
    if (!activeRun || !activeThread) {
      return;
    }
    const payload = await applyCodexVariant(variant.id);
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== activeThread.id ? thread : { ...thread, runs: thread.runs.map((run) => (run.id === payload.run.id ? payload.run : run)) },
      ),
    );
    onStatus(`Applied ${variant.label}.`, "success");
  }

  async function handleRejectVariant(variant: CodexRunVariant): Promise<void> {
    if (!activeRun || !activeThread) {
      return;
    }
    const payload = await rejectCodexVariant(variant.id);
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== activeThread.id ? thread : { ...thread, runs: thread.runs.map((run) => (run.id === payload.run.id ? payload.run : run)) },
      ),
    );
    onStatus(`Rejected ${variant.label}.`, "info");
  }

  async function handleToggleVariantMark(variant: CodexRunVariant): Promise<void> {
    if (!activeRun || !activeThread || activeRun.reviewState === "applied") {
      return;
    }
    const payload = await markCodexVariant(variant.id, !variant.markedForRevision);
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== activeThread.id ? thread : { ...thread, runs: thread.runs.map((run) => (run.id === payload.run.id ? payload.run : run)) },
      ),
    );
    onStatus(`${variant.markedForRevision ? "Unmarked" : "Marked"} ${variant.label} for the next revision round.`, "info");
  }

  async function handleModelChange(nextModel: string): Promise<void> {
    setPreferredModel(nextModel);
    if (!activeThread) {
      onStatus(`Default model set to ${nextModel}.`, "info");
      return;
    }
    try {
      const payload = await updateCodexThread(activeThread.id, { model: nextModel });
      setThreads((current) => current.map((thread) => (thread.id === payload.thread.id ? payload.thread : thread)));
      onStatus(`Model set to ${nextModel} for this chat.`, "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to update Codex model.", "error");
    }
  }

  async function handleReasoningEffortChange(nextEffort: CodexReasoningEffort): Promise<void> {
    setPreferredReasoningEffort(nextEffort);
    if (!activeThread) {
      onStatus(`Default effort set to ${nextEffort}.`, "info");
      return;
    }
    try {
      const payload = await updateCodexThread(activeThread.id, { reasoningEffort: nextEffort });
      setThreads((current) => current.map((thread) => (thread.id === payload.thread.id ? payload.thread : thread)));
      onStatus(`Effort set to ${nextEffort} for this chat.`, "success");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to update Codex effort.", "error");
    }
  }

  return {
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
  };
}
