import { useMemo } from "react";

import type { CodexFigureContext, CodexThread } from "../../shared/types/editor";
import { annotationPromptLabel, objectPromptLabel, parsePromptSegments } from "./promptTokens";

export type CodexReferenceToken = {
  kind: "object" | "annotation";
  id: string;
  label: string;
  objectKind?: string;
};

export function useCodexReferenceTokens(config: {
  activeThread: CodexThread | null;
  figureContext: CodexFigureContext | null;
}) {
  const { activeThread, figureContext } = config;
  const hasReferenceItems = Boolean(
    figureContext && (figureContext.selectedObjects.length || figureContext.annotations.length),
  );

  const referenceTokens = useMemo(() => {
    if (!figureContext) {
      return { objects: [], annotations: [] };
    }
    return {
      objects: figureContext.selectedObjects.map((item) => ({
        kind: "object" as const,
        id: item.id,
        label: objectPromptLabel(item),
        objectKind: item.kind,
      })),
      annotations: figureContext.annotations.map((annotation, index) => ({
        kind: "annotation" as const,
        id: annotation.id,
        label: annotationPromptLabel(annotation, index),
      })),
    };
  }, [figureContext]);

  const recentReferenceTokens = useMemo(() => {
    if (!activeThread || !figureContext) {
      return [] as CodexReferenceToken[];
    }
    const liveObjectIds = new Set(referenceTokens.objects.map((token) => token.id));
    const liveAnnotationIds = new Set(referenceTokens.annotations.map((token) => token.id));
    const seen = new Set<string>();
    const recent: CodexReferenceToken[] = [];
    for (let runIndex = activeThread.runs.length - 1; runIndex >= 0; runIndex -= 1) {
      const run = activeThread.runs[runIndex];
      const segments = parsePromptSegments(run.prompt);
      for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
        const segment = segments[segmentIndex];
        if (segment.type !== "token" || segment.token.kind === "gallery") {
          continue;
        }
        const key = `${segment.token.kind}:${segment.token.id}`;
        if (seen.has(key)) {
          continue;
        }
        if (segment.token.kind === "annotation") {
          const annotationIndex = figureContext.annotations.findIndex((annotation) => annotation.id === segment.token.id);
          if (annotationIndex === -1 || liveAnnotationIds.has(segment.token.id)) {
            continue;
          }
          seen.add(key);
          recent.push({
            kind: "annotation",
            id: segment.token.id,
            label: annotationPromptLabel(figureContext.annotations[annotationIndex], annotationIndex),
          });
          continue;
        }
        const object = figureContext.selectedObjects.find((item) => item.id === segment.token.id);
        if (!object || liveObjectIds.has(segment.token.id)) {
          continue;
        }
        seen.add(key);
        recent.push({
          kind: "object",
          id: segment.token.id,
          label: objectPromptLabel(object),
          objectKind: object.kind,
        });
      }
    }
    return recent.slice(0, 8);
  }, [activeThread, figureContext, referenceTokens.annotations, referenceTokens.objects]);

  return {
    hasVisualReferences: hasReferenceItems || recentReferenceTokens.length > 0,
    referenceTokens,
    recentReferenceTokens,
  };
}
