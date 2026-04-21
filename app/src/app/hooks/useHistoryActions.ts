import type { MutableRefObject } from "react";

import { endTraceOperation, startTraceOperation, traceOperationDuration } from "../../shared/lib/trace";
import type { FigureSource, HistorySnapshot, ViewportState } from "../../shared/types/editor";

export function useHistoryActions(config: {
  activeFigureRef: MutableRefObject<string>;
  selectedIdsRef: MutableRefObject<string[]>;
  descriptionDraft: string;
  viewport: ViewportState;
  codexSnapshot: () => HistorySnapshot["codex"];
  currentSvgString: () => string;
  svgRoot: () => SVGSVGElement | null;
  setViewport: React.Dispatch<React.SetStateAction<ViewportState>>;
  setDescriptionDraft: React.Dispatch<React.SetStateAction<string>>;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  setSources: React.Dispatch<React.SetStateAction<Record<string, FigureSource>>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  restoreCodexSnapshot: (snapshot: HistorySnapshot["codex"]) => void;
  popUndoSnapshot: (figureId: string, current: HistorySnapshot | null) => HistorySnapshot | null;
  popRedoSnapshot: (figureId: string, current: HistorySnapshot | null) => HistorySnapshot | null;
  debugLog: (label: string, payload?: unknown) => void;
}) {
  function currentSnapshot(): HistorySnapshot | null {
    const root = config.svgRoot();
    if (!root) {
      return null;
    }
    return {
      svg: config.currentSvgString(),
      description: config.descriptionDraft,
      selectedIds: config.selectedIdsRef.current,
      viewport: config.viewport,
      codex: config.codexSnapshot(),
    };
  }

  function restoreSnapshot(snapshot: HistorySnapshot, reason: "undo" | "redo"): void {
    const figureId = config.activeFigureRef.current;
    if (!figureId) {
      return;
    }
    const operation = startTraceOperation(config.debugLog, "history.restore", {
      figureId,
      reason,
      selectedIds: snapshot.selectedIds,
    });
    const applyStartedAt = performance.now();
    config.selectedIdsRef.current = snapshot.selectedIds;
    config.setViewport(snapshot.viewport);
    config.setDescriptionDraft(snapshot.description);
    config.restoreCodexSnapshot(snapshot.codex);
    config.setHasUnsavedChanges(true);
    config.setSources((current) => {
      const existing = current[figureId];
      if (!existing) {
        return current;
      }
      return {
        ...current,
        [figureId]: {
          ...existing,
          svg: snapshot.svg,
          figure: {
            ...existing.figure,
            description: snapshot.description,
          },
        },
      };
    });
    traceOperationDuration(config.debugLog, operation, "apply", applyStartedAt, {
      viewport: snapshot.viewport,
      selectedIds: snapshot.selectedIds,
    });
    endTraceOperation(config.debugLog, operation, {
      viewport: snapshot.viewport,
      selectedIds: snapshot.selectedIds,
    });
  }

  function undo(): void {
    const figureId = config.activeFigureRef.current;
    const previous = config.popUndoSnapshot(figureId, currentSnapshot());
    if (!previous) {
      return;
    }
    restoreSnapshot(previous, "undo");
    config.setStatus("Undo");
  }

  function redo(): void {
    const figureId = config.activeFigureRef.current;
    const next = config.popRedoSnapshot(figureId, currentSnapshot());
    if (!next) {
      return;
    }
    restoreSnapshot(next, "redo");
    config.setStatus("Redo");
  }

  return {
    currentSnapshot,
    restoreSnapshot,
    undo,
    redo,
  };
}
