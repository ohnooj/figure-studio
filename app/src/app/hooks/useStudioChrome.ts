import { useEffect, useState } from "react";
import type { ThemePreference } from "../../shared/types/editor";
import {
  DEFAULT_BOTTOM_HEIGHT,
  DEFAULT_CODEX_MARKS_HEIGHT,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_OBJECT_HEIGHT,
  DEFAULT_RIGHT_WIDTH,
  MIN_BOTTOM_HEIGHT,
  MIN_CODEX_MARKS_HEIGHT,
  MIN_LEFT_WIDTH,
  MIN_OBJECT_HEIGHT,
  MIN_RIGHT_WIDTH,
} from "../constants";

const LEGACY_DEFAULT_OBJECT_HEIGHT = 220;
const LEGACY_DEFAULT_RIGHT_WIDTH = 300;

export function useStudioChrome() {
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [showHelpers, setShowHelpers] = useState(true);
  const [debugLogging, setDebugLogging] = useState(false);
  const [alignmentEnabled, setAlignmentEnabled] = useState(true);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [objectSectionHeight, setObjectSectionHeight] = useState(DEFAULT_OBJECT_HEIGHT);
  const [codexMarksHeight, setCodexMarksHeight] = useState(DEFAULT_CODEX_MARKS_HEIGHT);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(DEFAULT_BOTTOM_HEIGHT);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("paper_figures.theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      setThemePreference(savedTheme);
    }
    const savedHelpers = window.localStorage.getItem("paper_figures.showHelpers");
    if (savedHelpers === "false") {
      setShowHelpers(false);
    }
    if (window.localStorage.getItem("paper_figures.debugLogging") === "true") {
      setDebugLogging(true);
    }
    if (window.localStorage.getItem("paper_figures.alignmentEnabled") === "false") {
      setAlignmentEnabled(false);
    }
    const savedLeftWidth = Number(window.localStorage.getItem("paper_figures.leftWidth"));
    if (Number.isFinite(savedLeftWidth) && savedLeftWidth >= MIN_LEFT_WIDTH) {
      setLeftWidth(savedLeftWidth);
    }
    const savedRightWidthMode = window.localStorage.getItem("paper_figures.rightWidthMode");
    const savedRightWidth = Number(window.localStorage.getItem("paper_figures.rightWidth"));
    if (savedRightWidth === LEGACY_DEFAULT_RIGHT_WIDTH) {
      window.localStorage.removeItem("paper_figures.rightWidthMode");
    } else if (savedRightWidthMode === "custom" && Number.isFinite(savedRightWidth) && savedRightWidth >= MIN_RIGHT_WIDTH) {
      setRightWidth(savedRightWidth);
    } else if (Number.isFinite(savedRightWidth) && savedRightWidth >= MIN_RIGHT_WIDTH) {
      setRightWidth(savedRightWidth);
    }
    const savedObjectHeight = Number(window.localStorage.getItem("paper_figures.objectHeight"));
    if (Number.isFinite(savedObjectHeight) && savedObjectHeight >= MIN_OBJECT_HEIGHT) {
      setObjectSectionHeight(
        savedObjectHeight === LEGACY_DEFAULT_OBJECT_HEIGHT ? DEFAULT_OBJECT_HEIGHT : savedObjectHeight,
      );
    }
    const savedCodexMarksHeight = Number(window.localStorage.getItem("paper_figures.codexMarksHeight"));
    if (Number.isFinite(savedCodexMarksHeight) && savedCodexMarksHeight >= MIN_CODEX_MARKS_HEIGHT) {
      setCodexMarksHeight(savedCodexMarksHeight);
    }
    const savedBottomHeight = Number(window.localStorage.getItem("paper_figures.bottomHeight"));
    if (Number.isFinite(savedBottomHeight) && savedBottomHeight >= MIN_BOTTOM_HEIGHT) {
      setBottomPanelHeight(savedBottomHeight);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (): void => {
      const nextTheme = themePreference === "system" ? (media.matches ? "dark" : "light") : themePreference;
      setResolvedTheme(nextTheme);
      document.documentElement.dataset.editorTheme = nextTheme;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themePreference]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.theme", themePreference);
  }, [themePreference]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.showHelpers", showHelpers ? "true" : "false");
  }, [showHelpers]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.debugLogging", debugLogging ? "true" : "false");
  }, [debugLogging]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.alignmentEnabled", alignmentEnabled ? "true" : "false");
  }, [alignmentEnabled]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.leftWidth", String(Math.round(leftWidth)));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.rightWidth", String(Math.round(rightWidth)));
  }, [rightWidth]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.objectHeight", String(Math.round(objectSectionHeight)));
  }, [objectSectionHeight]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.codexMarksHeight", String(Math.round(codexMarksHeight)));
  }, [codexMarksHeight]);

  useEffect(() => {
    window.localStorage.setItem("paper_figures.bottomHeight", String(Math.round(bottomPanelHeight)));
  }, [bottomPanelHeight]);

  return {
    themePreference,
    setThemePreference,
    resolvedTheme,
    showHelpers,
    setShowHelpers,
    debugLogging,
    setDebugLogging,
    alignmentEnabled,
    setAlignmentEnabled,
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
    objectSectionHeight,
    setObjectSectionHeight,
    codexMarksHeight,
    setCodexMarksHeight,
    bottomPanelHeight,
    setBottomPanelHeight,
  };
}
