import { API_ROOT, api } from "./client";
import type {
  CodexApprovalPolicy,
  CodexFigureContext,
  CodexRun,
  CodexRunEvent,
  CodexSandboxMode,
  CodexThreadScope,
  CodexThread,
} from "../types/editor";

function normalizeCodexRun(run: CodexRun): CodexRun {
  return {
    ...run,
    targetFigureId: run.targetFigureId || run.figureContext.figureId || "",
    scopeSnapshot: run.scopeSnapshot === "global" ? "global" : "figure",
    resultsCount: Math.max(1, Math.min(3, Number(run.resultsCount) || 1)),
    reviewState: run.reviewState === "applied" ? "applied" : "pending",
    appliedVariantId: run.appliedVariantId || null,
    events: Array.isArray(run.events) ? run.events : [],
    variants: Array.isArray(run.variants)
      ? run.variants.map((variant) => ({
          ...variant,
          controlManifest: variant.controlManifest && typeof variant.controlManifest === "object"
            ? {
                id: String(variant.controlManifest.id || "codex-generated-controls"),
                title: String(variant.controlManifest.title || "Generated Controls"),
                intentSummary: String(variant.controlManifest.intentSummary || ""),
                userGoal: String(variant.controlManifest.userGoal || ""),
                changeTheme: String(variant.controlManifest.changeTheme || ""),
                controlSummary: String(variant.controlManifest.controlSummary || ""),
                runtimeEntry: String(variant.controlManifest.runtimeEntry || "runtime.js"),
                initialState: variant.controlManifest.initialState && typeof variant.controlManifest.initialState === "object"
                  ? variant.controlManifest.initialState
                  : {},
                changedElementHints: Array.isArray(variant.controlManifest.changedElementHints)
                  ? variant.controlManifest.changedElementHints.map((item) => String(item))
                  : [],
              }
            : null,
          controlRuntimePath: variant.controlRuntimePath || null,
          controlHostUrl: `${API_ROOT}/api/codex/variants/${variant.id}/control-host`,
          controlRuntimeUrl: `${API_ROOT}/api/codex/variants/${variant.id}/control-runtime.js`,
          interactiveState: variant.interactiveState && typeof variant.interactiveState === "object" ? variant.interactiveState : {},
          interactivePreviewSvg: variant.interactivePreviewSvg || null,
          controlStatus: variant.controlStatus || null,
          reviewState: variant.reviewState === "applied" ? "applied" : variant.reviewState === "rejected" ? "rejected" : "pending",
          markedForRevision: Boolean(variant.markedForRevision),
        }))
      : [],
  };
}

function normalizeCodexThread(thread: CodexThread): CodexThread {
  return {
    ...thread,
    scope: thread.scope === "global" ? "global" : "figure",
    runs: Array.isArray(thread.runs) ? thread.runs.map(normalizeCodexRun) : [],
  };
}

export function fetchCodexThreads(figureId?: string, archived = false): Promise<{ threads: CodexThread[] }> {
  const params = new URLSearchParams();
  if (figureId) {
    params.set("figureId", figureId);
  }
  if (archived) {
    params.set("archived", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return api<{ threads: CodexThread[] }>(`/api/codex/threads${suffix}`).then((payload) => ({
    threads: payload.threads.map(normalizeCodexThread),
  }));
}

export function fetchCodexThread(threadId: string): Promise<{ thread: CodexThread }> {
  return api<{ thread: CodexThread }>(`/api/codex/threads/${threadId}`).then((payload) => ({
    thread: normalizeCodexThread(payload.thread),
  }));
}

export function createCodexThread(payload: {
  figureId: string;
  scope?: CodexThreadScope;
  title?: string;
  model?: string | null;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | null;
  sandboxMode: CodexSandboxMode;
  approvalPolicy: CodexApprovalPolicy;
  personality?: string | null;
}): Promise<{ thread: CodexThread }> {
  return api<{ thread: CodexThread }>("/api/codex/threads", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => ({ thread: normalizeCodexThread(response.thread) }));
}

export function updateCodexThread(
  threadId: string,
  payload: {
    title?: string;
    archived?: boolean;
    scope?: CodexThreadScope;
    model?: string | null;
    reasoningEffort?: "low" | "medium" | "high" | "xhigh" | null;
    sandboxMode?: CodexSandboxMode;
    approvalPolicy?: CodexApprovalPolicy;
    personality?: string | null;
  },
): Promise<{ thread: CodexThread }> {
  return api<{ thread: CodexThread }>(`/api/codex/threads/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((response) => ({ thread: normalizeCodexThread(response.thread) }));
}

export function clearCodexThread(threadId: string): Promise<{ thread: CodexThread }> {
  return api<{ thread: CodexThread }>(`/api/codex/threads/${threadId}/clear`, {
    method: "POST",
  }).then((response) => ({ thread: normalizeCodexThread(response.thread) }));
}

export function deleteCodexThread(threadId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/codex/threads/${threadId}`, {
    method: "DELETE",
  });
}

export function createCodexRun(
  threadId: string,
  payload: {
    prompt: string;
    activeFigureId: string;
    resultsCount: number;
    revisionVariantIds?: string[];
    figureContext: CodexFigureContext;
  },
): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/threads/${threadId}/runs`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => ({ run: normalizeCodexRun(response.run) }));
}

export function fetchCodexRun(runId: string): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/runs/${runId}`).then((payload) => ({
    run: normalizeCodexRun(payload.run),
  }));
}

export function cancelCodexRun(runId: string): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/runs/${runId}/cancel`, { method: "POST" }).then((payload) => ({
    run: normalizeCodexRun(payload.run),
  }));
}

export function applyCodexVariant(variantId: string): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/variants/${variantId}/apply`, { method: "POST" }).then((payload) => ({
    run: normalizeCodexRun(payload.run),
  }));
}

export function rejectCodexVariant(variantId: string): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/variants/${variantId}/reject`, { method: "POST" }).then((payload) => ({
    run: normalizeCodexRun(payload.run),
  }));
}

export function markCodexVariant(variantId: string, marked: boolean): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/variants/${variantId}/mark`, {
    method: "POST",
    body: JSON.stringify({ marked }),
  }).then((payload) => ({
    run: normalizeCodexRun(payload.run),
  }));
}

export function saveCodexVariantInteractive(
  variantId: string,
  payload: {
    state: Record<string, unknown>;
    previewSvg?: string | null;
    status?: string | null;
  },
): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/variants/${variantId}/interactive`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => ({
    run: normalizeCodexRun(response.run),
  }));
}

export function resetCodexVariantInteractive(variantId: string): Promise<{ run: CodexRun }> {
  return api<{ run: CodexRun }>(`/api/codex/variants/${variantId}/interactive/reset`, {
    method: "POST",
  }).then((response) => ({
    run: normalizeCodexRun(response.run),
  }));
}

export function openCodexRunEventSource(runId: string): EventSource {
  return new EventSource(`${API_ROOT}/api/codex/runs/${runId}/events`);
}

export function mergeCodexRunEvents(existing: CodexRunEvent[], incoming: CodexRunEvent[]): CodexRunEvent[] {
  const seen = new Set(existing.map((event) => event.seq));
  const merged = [...existing];
  for (const event of incoming) {
    if (!seen.has(event.seq)) {
      merged.push(event);
      seen.add(event.seq);
    }
  }
  merged.sort((left, right) => left.seq - right.seq);
  return merged;
}
