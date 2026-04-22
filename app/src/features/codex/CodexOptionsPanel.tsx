import type { CodexReasoningEffort, CodexThread } from "../../shared/types/editor";
import { CODEX_MODEL_OPTIONS } from "./useCodexWorkspace";

const REASONING_EFFORT_OPTIONS = [
  { value: "low", label: "Effort: Low" },
  { value: "medium", label: "Effort: Medium" },
  { value: "high", label: "Effort: High" },
  { value: "xhigh", label: "Effort: XHigh" },
] as const;

export function CodexOptionsPanel(props: {
  optionsOpen: boolean;
  activeThread: CodexThread | null;
  activeModel: string;
  activeReasoningEffort: CodexReasoningEffort;
  currentFigureLabel: string;
  includeFigureContext: boolean;
  planMode: boolean;
  weeklyQuotaTokens: number;
  resultsCount: number;
  isSending: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onModelChange: (value: string) => Promise<void>;
  onReasoningEffortChange: (value: CodexReasoningEffort) => Promise<void>;
  onWeeklyQuotaChange: (value: number) => void;
  onCycleResultsCount: () => void;
}) {
  return (
    <details className="codex-options" open={props.optionsOpen} onToggle={(event) => props.onOptionsOpenChange((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>Chat Options</summary>
      <div className="codex-thread-settings-inline codex-thread-settings-static">
        <div className="codex-static-field">
          <span>Model</span>
          <label className="codex-inline-select">
            <select
              className="codex-settings-select"
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
        </div>
        <div className="codex-static-field">
          <span>Effort</span>
          <label className="codex-inline-select">
            <select
              className="codex-settings-select"
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
        </div>
        <div className="codex-static-field">
          <span>Session ID</span>
          <code>{props.activeThread?.codexThreadId ?? props.activeThread?.id ?? "Unavailable"}</code>
        </div>
        <div className="codex-static-field">
          <span>Current Figure</span>
          <code>{props.currentFigureLabel}</code>
        </div>
        <div className="codex-static-field">
          <span>Figure Context</span>
          <code>{props.includeFigureContext ? "Attached" : "Off"}</code>
        </div>
        <div className="codex-static-field">
          <span>Scope</span>
          <code>{props.activeThread?.scope ?? "figure"}</code>
        </div>
        <div className="codex-static-field">
          <span>Modes</span>
          <code>{[props.planMode ? "plan" : ""].filter(Boolean).join(", ") || "default"}</code>
        </div>
        <label className="codex-static-field codex-static-field-input">
          <span>Weekly Quota</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={props.weeklyQuotaTokens || ""}
            placeholder="tokens"
            onChange={(event) => props.onWeeklyQuotaChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
          />
        </label>
        <div className="codex-static-field">
          <span>Results</span>
          <button onClick={props.onCycleResultsCount}>Results {props.resultsCount}</button>
        </div>
      </div>
    </details>
  );
}
