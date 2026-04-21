import { useEffect, useRef, type RefObject } from "react";

export function useKeyboardShortcuts(config: {
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  objectHierarchyRef: RefObject<HTMLDivElement | null>;
  codexMode: boolean;
  hasCodexSelection: boolean;
  spacePressedRef: React.MutableRefObject<boolean>;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onFit: () => void;
  onZoom100: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCodexCopy: () => void;
  onCodexPaste: () => void;
  onCodexGroup: () => void;
  onCodexUndo: () => void;
  onCodexRedo: () => void;
  onCodexDelete: () => void;
  onCodexSelectAll: () => void;
  onCodexClearSelection: () => void;
}) {
  const configRef = useRef(config);
  configRef.current = config;
  const canvasActiveRef = useRef(false);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      return target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    }

    function isCanvasScopedTarget(target: EventTarget | null): boolean {
      const canvas = configRef.current.canvasViewportRef.current;
      const hierarchy = configRef.current.objectHierarchyRef.current;
      return Boolean(
        target instanceof Node &&
        ((canvas instanceof HTMLElement && canvas.contains(target)) ||
          (hierarchy instanceof HTMLElement && hierarchy.contains(target))),
      );
    }

    function updateCanvasActive(target: EventTarget | null): void {
      canvasActiveRef.current = isCanvasScopedTarget(target);
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const modifier = event.metaKey || event.ctrlKey;
      const typingTarget = isTypingTarget(event.target);
      const canvasScopedTarget = isCanvasScopedTarget(event.target) || canvasActiveRef.current;
      const useCodexHistory = configRef.current.codexMode;
      const useCodexDelete = configRef.current.codexMode || configRef.current.hasCodexSelection;

      if (event.code === "Space") {
        if (!canvasScopedTarget || typingTarget) {
          return;
        }
        configRef.current.spacePressedRef.current = true;
        return;
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        configRef.current.onSave();
        return;
      }
      if (typingTarget) {
        return;
      }
      if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        if (useCodexHistory) {
          configRef.current.onCodexRedo();
        } else {
          configRef.current.onRedo();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (useCodexHistory) {
          configRef.current.onCodexUndo();
        } else {
          configRef.current.onUndo();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (useCodexHistory) {
          configRef.current.onCodexRedo();
        } else {
          configRef.current.onRedo();
        }
        return;
      }
      if (!canvasScopedTarget) {
        return;
      }
      if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        if (configRef.current.codexMode) {
          configRef.current.onCodexCopy();
        } else {
          configRef.current.onCopy();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        if (configRef.current.codexMode) {
          configRef.current.onCodexPaste();
        } else {
          configRef.current.onPaste();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (configRef.current.codexMode) {
          configRef.current.onCodexSelectAll();
        } else {
          configRef.current.onSelectAll();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "g" && event.shiftKey) {
        event.preventDefault();
        if (!configRef.current.codexMode) {
          configRef.current.onUngroup();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (configRef.current.codexMode) {
          configRef.current.onCodexGroup();
        } else {
          configRef.current.onGroup();
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (useCodexDelete) {
          configRef.current.onCodexDelete();
        } else {
          configRef.current.onDelete();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (configRef.current.codexMode) {
          configRef.current.onCodexClearSelection();
        } else {
          configRef.current.onClearSelection();
        }
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        configRef.current.onFit();
        return;
      }
      if (event.key === "1") {
        event.preventDefault();
        configRef.current.onZoom100();
        return;
      }
      if (modifier && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        configRef.current.onZoomIn();
        return;
      }
      if (modifier && (event.key === "-" || event.key === "_")) {
        event.preventDefault();
        configRef.current.onZoomOut();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") {
        configRef.current.spacePressedRef.current = false;
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      updateCanvasActive(event.target);
    };
    const onFocusIn = (event: FocusEvent): void => {
      updateCanvasActive(event.target);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, []);
}
