import { useCallback, useState, type RefObject } from "react";

import { elementKind } from "../../shared/lib/svg/selectability";
import { overlayRectFromElement, selectedFromElement } from "../../shared/lib/svg/selection";
import type { SelectionBox } from "../../shared/types/editor";

export function useTextEditing(config: {
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  elementById: (id: string) => SVGElement | null;
  editableTextNode: (element: SVGElement | null) => SVGTextElement | null;
  refreshSelection: (element?: SVGElement | null) => void;
  pushHistoryCheckpoint: (key?: string, force?: boolean) => void;
  scheduleSave: () => void;
}) {
  const [editingTextId, setEditingTextId] = useState("");
  const [editingTextValue, setEditingTextValue] = useState("");
  const [editingTextBox, setEditingTextBox] = useState<SelectionBox | null>(null);

  const syncEditingTextBox = useCallback((id: string): void => {
    const element = config.elementById(id);
    const preview = config.canvasViewportRef.current;
    if (!element || !preview) {
      setEditingTextBox(null);
      return;
    }
    const rect = overlayRectFromElement(element);
    const previewRect = preview.getBoundingClientRect();
    setEditingTextBox({
      left: rect.left - previewRect.left,
      top: rect.top - previewRect.top,
      width: Math.max(rect.width, 72),
      height: Math.max(rect.height, 28),
    });
  }, [config.canvasViewportRef, config.elementById]);

  const cancelTextEdit = useCallback((): void => {
    setEditingTextId("");
    setEditingTextValue("");
    setEditingTextBox(null);
  }, []);

  const beginTextEdit = useCallback((element: SVGElement | null): void => {
    if (!element || elementKind(element) !== "text" || !element.id) {
      return;
    }
    config.refreshSelection(element);
    setEditingTextId(element.id);
    setEditingTextValue(selectedFromElement(element).text);
    requestAnimationFrame(() => {
      syncEditingTextBox(element.id);
    });
  }, [config, syncEditingTextBox]);

  const commitTextEdit = useCallback((): void => {
    const element = config.elementById(editingTextId);
    const textNode = config.editableTextNode(element);
    if (!element || !textNode) {
      cancelTextEdit();
      return;
    }
    config.pushHistoryCheckpoint("text-inline", true);
    textNode.textContent = editingTextValue;
    config.refreshSelection(element);
    config.scheduleSave();
    cancelTextEdit();
  }, [cancelTextEdit, config, editingTextId, editingTextValue]);

  return {
    editingTextId,
    editingTextValue,
    editingTextBox,
    setEditingTextValue,
    syncEditingTextBox,
    beginTextEdit,
    cancelTextEdit,
    commitTextEdit,
  };
}
