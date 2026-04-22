import { useCallback, type MutableRefObject } from "react";

import type { ViewportState } from "../../shared/types/editor";

type EditorSnapshot = {
  svg: string;
  description: string;
  selectedIds: string[];
  viewport: ViewportState;
};

export function useCurrentEditorSnapshot(config: {
  currentSvgString: () => string;
  descriptionDraft: string;
  selectedIdsRef: MutableRefObject<string[]>;
  svgRoot: () => SVGSVGElement | null;
  viewport: ViewportState;
}) {
  return useCallback((): EditorSnapshot | null => {
    const root = config.svgRoot();
    if (!root) {
      return null;
    }
    return {
      svg: config.currentSvgString(),
      description: config.descriptionDraft,
      selectedIds: config.selectedIdsRef.current,
      viewport: config.viewport,
    };
  }, [config.currentSvgString, config.descriptionDraft, config.selectedIdsRef, config.svgRoot, config.viewport]);
}
