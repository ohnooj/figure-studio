import type { CodexReasoningEffort } from "../../shared/types/editor";

export const CODEX_MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
] as const;

export const DEFAULT_CODEX_MODEL = "gpt-5.4";
export const DEFAULT_REASONING_EFFORT: CodexReasoningEffort = "medium";
export const FIXED_CODEX_SANDBOX = "workspace-write";
export const FIXED_CODEX_APPROVAL = "never";
export const MODEL_CONTEXT_TOKENS = 272_000;

export const SLASH_COMMANDS = [
  { id: "plan", command: "/plan", label: "Plan mode", description: "Toggle planning-first replies." },
  { id: "compact", command: "/compact", label: "Compact session", description: "Compact the current chat session history." },
  { id: "global", command: "/global", label: "Global workspace", description: "Switch to a chat staged with all figures in the workspace." },
  { id: "clear", command: "/clear", label: "Clear chat", description: "Reset the current chat context and history." },
  { id: "fig", command: "/fig", label: "Figure context", description: "Toggle figure context attachment." },
] as const;

export type SlashCommandId = (typeof SLASH_COMMANDS)[number]["id"];
