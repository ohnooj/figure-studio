import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { CodexFigureContext, CodexReasoningEffort } from "../../shared/types/editor";
import { PromptEditor } from "./PromptEditor";
import { CODEX_MODEL_OPTIONS } from "./useCodexWorkspace";
import { CodexReferenceChips } from "./CodexReferenceChips";
import type { CodexReferenceToken } from "./useCodexReferenceTokens";
import type { SlashCommandId } from "./useCodexWorkspace";

const REASONING_EFFORT_OPTIONS = [
  { value: "low", label: "Effort: Low" },
  { value: "medium", label: "Effort: Medium" },
  { value: "high", label: "Effort: High" },
  { value: "xhigh", label: "Effort: XHigh" },
] as const;

type SelectionState = {
  selectedCodexAnnotationId: string;
  hoveredCodexAnnotationId: string;
  linkedObjectIds: string[];
  hoveredObjectId: string;
};

type HoverHandlers = {
  onHoverAnnotation: (annotationId: string) => void;
  onHoverObject: (objectId: string) => void;
};

function handleComposerKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  config: {
    commandSuggestions: { id: SlashCommandId; command: string }[];
    selectedCommandIndex: number;
    setSelectedCommandIndex: (updater: (current: number) => number) => void;
    setPrompt: (value: string) => void;
    executeLocalCommand: (commandId: SlashCommandId) => Promise<void>;
    handleSend: () => Promise<void>;
  },
): void {
  const { commandSuggestions, selectedCommandIndex, setSelectedCommandIndex, setPrompt, executeLocalCommand, handleSend } = config;
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
}

export function CodexComposer(props: {
  inputId: string;
  composerHeight: number;
  prompt: string;
  figureContext: CodexFigureContext | null;
  activeRunInProgress: boolean;
  commandSuggestions: { id: SlashCommandId; command: string; label: string; description: string }[];
  selectedCommandIndex: number;
  setSelectedCommandIndex: (updater: (current: number) => number) => void;
  setPrompt: (value: string) => void;
  executeLocalCommand: (commandId: SlashCommandId) => Promise<void>;
  handleSend: () => Promise<void>;
  handleCancelRun: () => Promise<void>;
  activeModel: string;
  activeReasoningEffort: CodexReasoningEffort;
  isSending: boolean;
  contextUsagePercent: string;
  weeklyUsageTokens: number;
  weeklyQuotaTokens: number;
  weeklyUsagePercent: string;
  resultsCount: number;
  activeOptionChips: string[];
  includeFigureContext: boolean;
  activeFigureReady: boolean;
  onModelChange: (value: string) => Promise<void>;
  onReasoningEffortChange: (value: CodexReasoningEffort) => Promise<void>;
  onCycleResultsCount: () => void;
  onClearOptionChip: (chip: string) => void;
  referenceState: {
    hasVisualReferences: boolean;
    referenceTokens: { objects: CodexReferenceToken[]; annotations: CodexReferenceToken[] };
    recentReferenceTokens: CodexReferenceToken[];
  };
  selectedState: SelectionState;
  hoverHandlers: HoverHandlers;
}) {
  return (
    <div className="codex-composer">
      <div className="codex-composer-header">
        <label htmlFor={props.inputId} className="codex-eyebrow">
          Prompt
        </label>
        <span className="codex-shortcut-hint">Cmd+Enter to send</span>
      </div>
      <div className="codex-composer-shell" style={{ minHeight: `${props.composerHeight}px` }}>
        <CodexReferenceChips
          figureContext={props.figureContext}
          hasVisualReferences={props.referenceState.hasVisualReferences}
          referenceTokens={props.referenceState.referenceTokens}
          recentReferenceTokens={props.referenceState.recentReferenceTokens}
          selectedState={props.selectedState}
          hoverHandlers={props.hoverHandlers}
        />
        {props.commandSuggestions.length ? (
          <div className="codex-command-menu" role="listbox" aria-label="Codex commands">
            {props.commandSuggestions.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={`codex-command-option ${index === props.selectedCommandIndex ? "active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => props.setPrompt(entry.command)}
              >
                <span className="codex-command-name">{entry.command}</span>
                <span className="codex-command-label">{entry.label}</span>
                <span className="codex-command-description">{entry.description}</span>
              </button>
            ))}
          </div>
        ) : null}
        <PromptEditor
          id={props.inputId}
          value={props.prompt}
          figureContext={props.figureContext}
          onChange={props.setPrompt}
          disabled={props.activeRunInProgress}
          onKeyDown={(event) => handleComposerKeyDown(event, props)}
          placeholder={props.activeRunInProgress ? "Codex is still working in this chat." : "Ask Codex about the current figure or use /global, /plan, /compact, /clear, /fig."}
        />
        <div className="codex-composer-footer">
          <div className="codex-composer-state codex-composer-state-inline">
            <div className="codex-model-meta" aria-live="polite">
              <label className="codex-inline-select">
                <span className="sr-only">Codex model</span>
                <select
                  className="codex-model-pill codex-pill-select"
                  value={props.activeModel}
                  onChange={(event) => void props.onModelChange(event.target.value)}
                  disabled={props.isSending}
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
                  value={props.activeReasoningEffort}
                  onChange={(event) => void props.onReasoningEffortChange(event.target.value as CodexReasoningEffort)}
                  disabled={props.isSending}
                >
                  {REASONING_EFFORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="codex-meta-chip" title="Approximate attached context usage as a share of the model context window.">Context {props.contextUsagePercent}</span>
              <span
                className="codex-meta-chip"
                title={props.weeklyQuotaTokens > 0
                  ? `Local weekly usage tracked here: ${props.weeklyUsageTokens.toLocaleString()} / ${props.weeklyQuotaTokens.toLocaleString()} tokens.`
                  : "Set a weekly quota in Chat Options to see a weekly usage percentage."}
              >
                Weekly {props.weeklyUsagePercent}
              </span>
              <button type="button" className="codex-meta-chip" onClick={props.onCycleResultsCount} title="Toggle how many result options Codex should generate for new requests.">
                Results {props.resultsCount}
              </button>
              {props.activeOptionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`codex-option-chip codex-option-chip-${chip.replace("/", "")}`}
                  onClick={() => props.onClearOptionChip(chip)}
                  title={`Clear ${chip}`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          <div className="codex-composer-actions">
            {props.activeRunInProgress ? <button onClick={() => void props.handleCancelRun()}>Stop</button> : null}
            <button
              className="codex-send-button"
              onClick={() => void props.handleSend()}
              disabled={props.isSending || props.activeRunInProgress || !props.activeFigureReady || (props.includeFigureContext && !props.figureContext)}
            >
              {props.activeRunInProgress ? "Running" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
