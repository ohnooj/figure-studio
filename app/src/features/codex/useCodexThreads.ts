import { useEffect, useRef, useState } from "react";

import { fetchCodexRun, fetchCodexThread, fetchCodexThreads, mergeCodexRunEvents, openCodexRunEventSource } from "../../shared/api/codex";
import type { CodexRun, CodexRunEvent, CodexThread } from "../../shared/types/editor";
import { isRunProcessing } from "./codexFormatting";

export function useCodexThreads(config: {
  onStatus: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const { onStatus } = config;
  const [threads, setThreads] = useState<CodexThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const activeRun = activeThread?.runs[activeThread.runs.length - 1] ?? null;
  const activeRunInProgress = Boolean(activeRun && isRunProcessing(activeRun));
  const activeThreadIdForRun = activeThread?.id ?? "";
  const activeRunId = activeRun?.id ?? "";
  const transcriptSignature = activeThread?.runs
    .map((run) => `${run.id}:${run.updatedAt}:${run.events.length}:${run.state}:${run.reviewState}:${run.variants.map((variant) => `${variant.id}:${variant.state}:${variant.reviewState}:${variant.markedForRevision}:${variant.updatedAt}`).join(",")}`)
    .join("|") ?? "";

  function replaceThread(nextThread: CodexThread): void {
    setThreads((current) => current.map((thread) => (thread.id === nextThread.id ? nextThread : thread)));
  }

  function replaceRun(nextRun: CodexRun): void {
    setThreads((current) =>
      current.map((thread) =>
        thread.runs.some((run) => run.id === nextRun.id)
          ? { ...thread, runs: thread.runs.map((run) => (run.id === nextRun.id ? nextRun : run)) }
          : thread,
      ),
    );
  }

  function dispatchRunRefresh(run: CodexRun): void {
    window.dispatchEvent(new CustomEvent("paper_figures:codex_run_refresh", { detail: { run } }));
  }

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
            dispatchRunRefresh(response.run);
            replaceRun(response.run);
          })
          .catch(() => undefined);
      }
    });
    return () => source.close();
  }, [activeRunId, activeRunInProgress, activeThreadIdForRun]);

  useEffect(() => {
    const onRunRefresh = (event: Event): void => {
      const detail = (event as CustomEvent<{ run: CodexRun }>).detail;
      if (!detail?.run) {
        return;
      }
      replaceRun(detail.run);
    };
    window.addEventListener("paper_figures:codex_run_refresh", onRunRefresh as EventListener);
    return () => window.removeEventListener("paper_figures:codex_run_refresh", onRunRefresh as EventListener);
  }, []);

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

  async function selectThread(threadId: string): Promise<void> {
    try {
      const payload = await fetchCodexThread(threadId);
      replaceThread(payload.thread);
      setActiveThreadId(threadId);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Failed to open Codex chat.", "error");
    }
  }

  return {
    threads,
    setThreads,
    activeThreadId,
    setActiveThreadId,
    activeThread,
    activeRun,
    activeRunInProgress,
    transcriptRef,
    updateAutoScrollState,
    dispatchRunRefresh,
    replaceThread,
    replaceRun,
    selectThread,
  };
}
