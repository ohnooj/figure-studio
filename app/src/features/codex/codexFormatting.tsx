import type { CodexRun, CodexRunEvent, CodexThread } from "../../shared/types/editor";

function renderInlineMarkdown(text: string): Array<string | { type: "code"; value: string }> {
  const parts: Array<string | { type: "code"; value: string }> = [];
  const pattern = /`([^`]+)`/g;
  let cursor = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    parts.push({ type: "code", value: match[1] ?? "" });
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

export function SimpleMarkdown(props: { text: string }) {
  const blocks = props.text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) {
    return null;
  }
  return (
    <div className="codex-markdown">
      {blocks.map((block, index) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const code = block.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "");
          return (
            <pre key={index}>
              <code>{code}</code>
            </pre>
          );
        }
        const lines = block.split("\n");
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {renderInlineMarkdown(line).map((part, partIndex) =>
                  typeof part === "string" ? <span key={partIndex}>{part}</span> : <code key={partIndex}>{part.value}</code>,
                )}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function extractEventMarkdown(event: CodexRunEvent): string {
  const payload = event.payload;
  const textish = [
    payload.delta,
    payload.text,
    payload.content,
    payload.summary,
    payload.output,
    payload.outputDelta,
    payload.textDelta,
    payload.summaryTextDelta,
  ];
  for (const candidate of textish) {
    if (typeof candidate === "string" && candidate.length) {
      return candidate;
    }
  }
  return "";
}

export function collectAssistantMarkdown(run: CodexRun): string {
  const events = Array.isArray(run.events) ? run.events : [];
  const completedMessages = events
    .map((event) => {
      if (event.type !== "codex.item.completed") {
        return "";
      }
      const item = event.payload.item;
      if (!item || typeof item !== "object") {
        return "";
      }
      const itemType = "type" in item ? item.type : null;
      const itemText = "text" in item ? item.text : null;
      return itemType === "agentMessage" && typeof itemText === "string" ? itemText : "";
    })
    .filter(Boolean);
  if (completedMessages.length) {
    return completedMessages.join("\n\n");
  }
  return events
    .filter((event) => event.type.includes("agentMessage") || event.type.includes("reasoning") || event.type.includes("plan.delta"))
    .map(extractEventMarkdown)
    .join("");
}

export function runStatusLabel(run: CodexRun): string {
  const rawStatus = run.currentStatus?.trim();
  if (!rawStatus) {
    return run.state;
  }
  try {
    const parsed = JSON.parse(rawStatus) as { type?: string; message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
    if (typeof parsed.type === "string" && parsed.type.trim()) {
      return parsed.type;
    }
  } catch {
    return rawStatus;
  }
  return rawStatus;
}

export function isRunProcessing(run: CodexRun): boolean {
  return ["queued", "running", "waiting"].includes(run.state);
}

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%";
  }
  if (value >= 100) {
    return "100%";
  }
  if (value >= 10) {
    return `${Math.round(value)}%`;
  }
  return `${value.toFixed(1)}%`;
}

export function estimateWeeklyUsage(threads: CodexThread[]): number {
  const cutoff = Date.now() / 1000 - 7 * 24 * 60 * 60;
  let total = 0;
  threads.forEach((thread) => {
    thread.runs.forEach((run) => {
      if (run.createdAt < cutoff) {
        return;
      }
      let runMax = 0;
      run.events.forEach((event) => {
        if (event.type !== "codex.thread.tokenUsage.updated") {
          return;
        }
        const tokenUsage = event.payload.tokenUsage;
        if (!tokenUsage || typeof tokenUsage !== "object") {
          return;
        }
        const totalUsage = "total" in tokenUsage ? tokenUsage.total : null;
        if (!totalUsage || typeof totalUsage !== "object") {
          return;
        }
        const totalTokens = "totalTokens" in totalUsage ? totalUsage.totalTokens : null;
        if (typeof totalTokens === "number" && Number.isFinite(totalTokens)) {
          runMax = Math.max(runMax, totalTokens);
        }
      });
      total += runMax;
    });
  });
  return total;
}
