import { useRef } from "react";
import type { HistorySnapshot } from "../../shared/types/editor";
import { MAX_HISTORY } from "../constants";

export function useEditorHistory() {
  const historyRef = useRef<Record<string, { past: HistorySnapshot[]; future: HistorySnapshot[] }>>({});
  const historyCoalesceRef = useRef<{ key: string; ts: number } | null>(null);

  function pushHistoryCheckpoint(figureId: string, snapshot: HistorySnapshot | null, key = "edit", force = false): void {
    if (!figureId || !snapshot) {
      return;
    }
    const now = Date.now();
    const last = historyCoalesceRef.current;
    if (!force && last && last.key === key && now - last.ts < 500) {
      return;
    }
    const history = historyRef.current[figureId] ?? { past: [], future: [] };
    history.past.push(snapshot);
    if (history.past.length > MAX_HISTORY) {
      history.past.shift();
    }
    history.future = [];
    historyRef.current[figureId] = history;
    historyCoalesceRef.current = { key, ts: now };
  }

  function undo(figureId: string, current: HistorySnapshot | null): HistorySnapshot | null {
    const history = historyRef.current[figureId];
    if (!figureId || !current || !history?.past.length) {
      return null;
    }
    const previous = history.past.pop();
    if (!previous) {
      return null;
    }
    history.future.push(current);
    historyRef.current[figureId] = history;
    return previous;
  }

  function redo(figureId: string, current: HistorySnapshot | null): HistorySnapshot | null {
    const history = historyRef.current[figureId];
    if (!figureId || !current || !history?.future.length) {
      return null;
    }
    const next = history.future.pop();
    if (!next) {
      return null;
    }
    history.past.push(current);
    historyRef.current[figureId] = history;
    return next;
  }

  return { pushHistoryCheckpoint, undo, redo };
}
