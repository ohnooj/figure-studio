import { useEffect, useState } from "react";

import type { CodexFigureContext, CodexReasoningEffort, CodexThread } from "../../shared/types/editor";
import { DEFAULT_CODEX_MODEL, DEFAULT_REASONING_EFFORT, MODEL_CONTEXT_TOKENS, SLASH_COMMANDS, type SlashCommandId, CODEX_MODEL_OPTIONS } from "./codexConfig";
import { estimateTokenCount, estimateWeeklyUsage, formatPercent } from "./codexFormatting";

const COMMAND_FRAGMENT_PATTERN = /(?:^|\s)\/([a-z]*)$/i;

export function useCodexComposerState(config: {
  figureContext: CodexFigureContext | null;
  threads: CodexThread[];
}) {
  const { figureContext, threads } = config;
  const [prompt, setPrompt] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState("");
  const [includeFigureContext, setIncludeFigureContext] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [weeklyQuotaTokens, setWeeklyQuotaTokens] = useState(0);
  const [resultsCount, setResultsCount] = useState(1);
  const [preferredModel, setPreferredModel] = useState<string>(DEFAULT_CODEX_MODEL);
  const [preferredReasoningEffort, setPreferredReasoningEffort] = useState<CodexReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const trimmedPrompt = prompt.trim();
  const trailingCommandMatch = prompt.match(COMMAND_FRAGMENT_PATTERN);
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
    setSelectedCommandIndex((current) => {
      if (!commandSuggestions.length) {
        return 0;
      }
      return Math.min(current, commandSuggestions.length - 1);
    });
  }, [commandSuggestions]);

  function cycleResultsCount(): void {
    setResultsCount((current) => (current >= 3 ? 1 : current + 1));
  }

  function clearPrompt(): void {
    setPrompt("");
  }

  function clearActiveOptionChip(chip: string, onStatus: (message: string, tone?: "success" | "error" | "info") => void): void {
    if (chip === "/plan") {
      setPlanMode(false);
      onStatus("Plan mode disabled.", "info");
      return;
    }
    setIncludeFigureContext(false);
    onStatus("Figure context attachment is off.", "info");
  }

  return {
    prompt,
    setPrompt,
    trimmedPrompt,
    optionsOpen,
    setOptionsOpen,
    copiedMessageKey,
    setCopiedMessageKey,
    includeFigureContext,
    setIncludeFigureContext,
    planMode,
    setPlanMode,
    weeklyQuotaTokens,
    setWeeklyQuotaTokens,
    resultsCount,
    cycleResultsCount,
    preferredModel,
    setPreferredModel,
    preferredReasoningEffort,
    setPreferredReasoningEffort,
    selectedCommandIndex,
    setSelectedCommandIndex,
    commandSuggestions,
    contextUsagePercent,
    weeklyUsageTokens,
    weeklyUsagePercent,
    activeOptionChips,
    clearPrompt,
    clearActiveOptionChip,
  };
}

export function extractInlineSlashCommands(value: string): { commands: SlashCommandId[]; prompt: string } {
  const commands: SlashCommandId[] = [];
  const prompt = value
    .replace(/(^|\s)(\/(plan|compact|global|clear|fig))(?=\s|$)/gi, (match, leadingWhitespace: string, _fullCommand: string, commandId: string) => {
      commands.push(commandId as SlashCommandId);
      return leadingWhitespace;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { commands, prompt };
}
