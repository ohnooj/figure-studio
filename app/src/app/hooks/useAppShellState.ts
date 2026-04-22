import { useEffect, useState } from "react";

import type { InteractionMode, ToolMode } from "../../shared/types/editor";

function isToolMode(value: string | null): value is ToolMode {
  return value === "select" ||
    value === "rectangle" ||
    value === "rounded-rectangle" ||
    value === "ellipse" ||
    value === "line" ||
    value === "arrow" ||
    value === "text" ||
    value === "image-slot" ||
    value === "curve";
}

function isInteractionMode(value: string | null): value is InteractionMode {
  return value === "resize" || value === "scale";
}

function isRightPanelMode(value: string | null): value is "inspector" | "codex" {
  return value === "inspector" || value === "codex";
}

export function useAppShellState() {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("resize");
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [rightPanelMode, setRightPanelMode] = useState<"inspector" | "codex">("codex");
  const [hotkeysOpen, setHotkeysOpen] = useState(false);

  useEffect(() => {
    const savedRightPanelMode = window.localStorage.getItem("paper_figures.rightPanelMode");
    if (isRightPanelMode(savedRightPanelMode)) {
      setRightPanelMode(savedRightPanelMode);
    }

    const savedToolMode = window.localStorage.getItem("paper_figures.toolMode");
    if (isToolMode(savedToolMode)) {
      setToolMode(savedToolMode);
    }

    const savedInteractionMode = window.localStorage.getItem("paper_figures.interactionMode");
    if (isInteractionMode(savedInteractionMode)) {
      setInteractionMode(savedInteractionMode);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.rightPanelMode", rightPanelMode);
  }, [rightPanelMode]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.toolMode", toolMode);
  }, [toolMode]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.interactionMode", interactionMode);
  }, [interactionMode]);

  useEffect(() => {
    if (!hotkeysOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setHotkeysOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hotkeysOpen]);

  return {
    interactionMode,
    setInteractionMode,
    toolMode,
    setToolMode,
    rightPanelMode,
    setRightPanelMode,
    hotkeysOpen,
    setHotkeysOpen,
  };
}
