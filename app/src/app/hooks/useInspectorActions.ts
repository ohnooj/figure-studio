import { useEffect, useRef } from "react";

import {
  elementKind,
} from "../../shared/lib/svg/selectability";
import { selectedFromElement } from "../../shared/lib/svg/selection";
import { setElementFrame, setElementPosition, setNumericAttribute, setStyleAttribute, setWorldRotation } from "../../shared/lib/svg/mutations";
import { svgViewBox } from "../../shared/lib/svg/document";
import type { HistorySnapshot, SelectedElement, ViewportState } from "../../shared/types/editor";

export function useInspectorActions(config: {
  activeFigureId: string;
  currentSnapshot: () => HistorySnapshot | null;
  pushHistoryCheckpoint: (figureId: string, snapshot: HistorySnapshot | null, key?: string, force?: boolean) => void;
  selected: SelectedElement | null;
  svgRoot: () => SVGSVGElement | null;
  selectedElement: () => SVGElement | null;
  selectedElements: () => SVGElement[];
  editableTextNode: (element: SVGElement | null) => SVGTextElement | null;
  refreshSelection: (element?: SVGElement | SVGElement[] | null) => void;
  scheduleSave: () => void;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  setViewport: React.Dispatch<React.SetStateAction<ViewportState>>;
  newAttributeName: string;
  setNewAttributeName: React.Dispatch<React.SetStateAction<string>>;
  newAttributeValue: string;
  setNewAttributeValue: React.Dispatch<React.SetStateAction<string>>;
}) {
  const pendingPreviewSnapshotRef = useRef<HistorySnapshot | null>(null);
  const hasPendingPreviewRef = useRef(false);

  useEffect(() => {
    pendingPreviewSnapshotRef.current = null;
    hasPendingPreviewRef.current = false;
  }, [config.activeFigureId, config.selected?.id, config.selected?.selectionCount]);

  function previewSelectedElement(mutate: (element: SVGElement) => void): void {
    const elements = config.selectedElements();
    if (!elements.length) {
      return;
    }
    if (!hasPendingPreviewRef.current) {
      pendingPreviewSnapshotRef.current = config.currentSnapshot();
      hasPendingPreviewRef.current = true;
    }
    elements.forEach((element) => mutate(element));
    config.refreshSelection(elements);
  }

  function updateSelectedElement(mutate: (element: SVGElement) => void, options?: { save?: boolean; message?: string }): void {
    const elements = config.selectedElements();
    if (!elements.length) {
      return;
    }
    config.pushHistoryCheckpoint(
      config.activeFigureId,
      hasPendingPreviewRef.current ? pendingPreviewSnapshotRef.current : config.currentSnapshot(),
      "inspector",
    );
    pendingPreviewSnapshotRef.current = null;
    hasPendingPreviewRef.current = false;
    elements.forEach((element) => mutate(element));
    config.refreshSelection(elements);
    if (options?.save !== false) {
      config.scheduleSave();
    }
    if (options?.message) {
      config.setStatus(options.message);
    }
  }

  function changeGeometry(field: "x" | "y" | "width" | "height" | "rotation", value: number): void {
    const applyGeometry = (element: SVGElement): void => {
      const current = selectedFromElement(element);
      const aggregate = config.selected;
      if (field === "x") {
        if (aggregate?.selectionCount && aggregate.selectionCount > 1) {
          setElementPosition(element, current.x + (value - aggregate.x), current.y);
        } else {
          setElementPosition(element, value, current.y);
        }
      } else if (field === "y") {
        if (aggregate?.selectionCount && aggregate.selectionCount > 1) {
          setElementPosition(element, current.x, current.y + (value - aggregate.y));
        } else {
          setElementPosition(element, current.x, value);
        }
      } else if (field === "rotation") {
        setWorldRotation(element, value);
      } else if (field === "width") {
        if (!aggregate?.selectionCount || aggregate.selectionCount === 1) {
          setElementFrame(element, current.x, current.y, value, current.height);
        }
      } else if (!aggregate?.selectionCount || aggregate.selectionCount === 1) {
        setElementFrame(element, current.x, current.y, current.width, value);
      }
    };
    updateSelectedElement(applyGeometry);
  }

  function previewGeometry(field: "x" | "y" | "width" | "height" | "rotation", value: number): void {
    const applyGeometry = (element: SVGElement): void => {
      const current = selectedFromElement(element);
      const aggregate = config.selected;
      if (field === "x") {
        if (aggregate?.selectionCount && aggregate.selectionCount > 1) {
          setElementPosition(element, current.x + (value - aggregate.x), current.y);
        } else {
          setElementPosition(element, value, current.y);
        }
      } else if (field === "y") {
        if (aggregate?.selectionCount && aggregate.selectionCount > 1) {
          setElementPosition(element, current.x, current.y + (value - aggregate.y));
        } else {
          setElementPosition(element, current.x, value);
        }
      } else if (field === "rotation") {
        setWorldRotation(element, value);
      } else if (field === "width") {
        if (!aggregate?.selectionCount || aggregate.selectionCount === 1) {
          setElementFrame(element, current.x, current.y, value, current.height);
        }
      } else if (!aggregate?.selectionCount || aggregate.selectionCount === 1) {
        setElementFrame(element, current.x, current.y, current.width, value);
      }
    };
    previewSelectedElement(applyGeometry);
  }

  function changeArtboardGeometry(field: "width" | "height", value: number): void {
    const root = config.svgRoot();
    if (!root) {
      return;
    }
    config.pushHistoryCheckpoint(config.activeFigureId, config.currentSnapshot(), "artboard", true);
    const artboard = svgViewBox(root);
    setElementFrame(root, 0, 0, field === "width" ? value : artboard.width, field === "height" ? value : artboard.height);
    const next = svgViewBox(root);
    config.setViewport((current) => ({ ...current, artboardWidth: next.width, artboardHeight: next.height }));
    config.refreshSelection(config.selectedElement());
    config.scheduleSave();
  }

  function previewArtboardGeometry(field: "width" | "height", value: number): void {
    const root = config.svgRoot();
    if (!root) {
      return;
    }
    const artboard = svgViewBox(root);
    setElementFrame(root, 0, 0, field === "width" ? value : artboard.width, field === "height" ? value : artboard.height);
    const next = svgViewBox(root);
    config.setViewport((current) => ({ ...current, artboardWidth: next.width, artboardHeight: next.height }));
    config.refreshSelection(config.selectedElement());
  }

  function changeText(value: string): void {
    updateSelectedElement((element) => {
      const textNode = config.editableTextNode(element);
      if (textNode) {
        textNode.textContent = value;
        return;
      }
      const placeholderId = element.getAttribute("data-placeholder-id");
      if (!placeholderId) {
        return;
      }
      const root = config.svgRoot();
      const placeholder = root?.querySelector<SVGTextElement>(`#${placeholderId}`);
      if (placeholder instanceof SVGTextElement) {
        placeholder.textContent = value;
      }
    }, { message: "Updated text." });
  }

  function clearSlotImage(): void {
    updateSelectedElement((element) => {
      if (elementKind(element) !== "slot") {
        return;
      }
      element.removeAttribute("href");
      element.removeAttribute("data-asset-path");
      element.setAttribute("opacity", "0.001");
      const placeholderId = element.getAttribute("data-placeholder-id");
      if (!placeholderId) {
        return;
      }
      const root = config.svgRoot();
      const placeholder = root?.querySelector<SVGElement>(`#${placeholderId}`);
      placeholder?.removeAttribute("display");
    }, { message: "Cleared slot image." });
  }

  function changeAttribute(name: string, value: string): void {
    updateSelectedElement((element) => {
      if (!value.trim()) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, value);
      }
    });
  }

  function addAttribute(): void {
    const name = config.newAttributeName.trim();
    if (!name) {
      return;
    }
    changeAttribute(name, config.newAttributeValue);
    config.setNewAttributeName("");
    config.setNewAttributeValue("");
  }

  function changeStyleNumber(field: "stroke-width" | "opacity" | "fill-opacity" | "stroke-opacity" | "rx" | "ry" | "font-size", value: number): void {
    const applyStyleNumber = (element: SVGElement): void => {
      if ((field === "rx" || field === "ry") && !(element instanceof SVGRectElement)) {
        return;
      }
      const textNode = config.editableTextNode(element);
      if (field === "font-size" && !textNode) {
        return;
      }
      if ((field === "font-size" || field === "opacity" || field === "fill-opacity" || field === "stroke-opacity") && textNode) {
        setNumericAttribute(textNode, field, value);
        return;
      }
      setNumericAttribute(element, field, value);
    };
    updateSelectedElement(applyStyleNumber);
  }

  function previewStyleNumber(field: "stroke-width" | "opacity" | "fill-opacity" | "stroke-opacity" | "rx" | "ry" | "font-size", value: number): void {
    const applyStyleNumber = (element: SVGElement): void => {
      if ((field === "rx" || field === "ry") && !(element instanceof SVGRectElement)) {
        return;
      }
      const textNode = config.editableTextNode(element);
      if (field === "font-size" && !textNode) {
        return;
      }
      if ((field === "font-size" || field === "opacity" || field === "fill-opacity" || field === "stroke-opacity") && textNode) {
        setNumericAttribute(textNode, field, value);
        return;
      }
      setNumericAttribute(element, field, value);
    };
    previewSelectedElement(applyStyleNumber);
  }

  function changeStyleString(field: "fill" | "stroke" | "stroke-dasharray" | "stroke-linecap" | "stroke-linejoin" | "font-family" | "font-weight" | "font-style" | "text-anchor", value: string): void {
    updateSelectedElement((element) => {
      const textNode = config.editableTextNode(element);
      if ((field.startsWith("font") || field === "text-anchor" || field === "fill") && textNode) {
        setStyleAttribute(textNode, field, value);
        return;
      }
      setStyleAttribute(element, field, value);
    });
  }

  function previewStyleString(field: "fill" | "stroke" | "stroke-dasharray" | "stroke-linecap" | "stroke-linejoin" | "font-family" | "font-weight" | "font-style" | "text-anchor", value: string): void {
    previewSelectedElement((element) => {
      const textNode = config.editableTextNode(element);
      if ((field.startsWith("font") || field === "text-anchor" || field === "fill") && textNode) {
        setStyleAttribute(textNode, field, value);
        return;
      }
      setStyleAttribute(element, field, value);
    });
  }

  function alignSelection(mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "same-width" | "same-height"): void {
    const elements = config.selectedElements();
    if (elements.length < 2) {
      return;
    }
    const anchor = selectedFromElement(elements[0]);
    updateSelectedElement((element) => {
      const current = selectedFromElement(element);
      if (mode === "left") {
        setElementPosition(element, anchor.x, current.y);
      } else if (mode === "center-x") {
        setElementPosition(element, anchor.x + anchor.width / 2 - current.width / 2, current.y);
      } else if (mode === "right") {
        setElementPosition(element, anchor.x + anchor.width - current.width, current.y);
      } else if (mode === "top") {
        setElementPosition(element, current.x, anchor.y);
      } else if (mode === "center-y") {
        setElementPosition(element, current.x, anchor.y + anchor.height / 2 - current.height / 2);
      } else if (mode === "bottom") {
        setElementPosition(element, current.x, anchor.y + anchor.height - current.height);
      } else if (mode === "same-width" && current.canResize) {
        setElementFrame(element, current.x, current.y, anchor.width, current.height);
      } else if (mode === "same-height" && current.canResize) {
        setElementFrame(element, current.x, current.y, current.width, anchor.height);
      }
    }, { message: "Aligned selection." });
  }

  return {
    newAttributeName: config.newAttributeName,
    setNewAttributeName: config.setNewAttributeName,
    newAttributeValue: config.newAttributeValue,
    setNewAttributeValue: config.setNewAttributeValue,
    changeGeometry,
    previewGeometry,
    changeArtboardGeometry,
    previewArtboardGeometry,
    changeText,
    clearSlotImage,
    changeAttribute,
    addAttribute,
    changeStyleNumber,
    previewStyleNumber,
    changeStyleString,
    previewStyleString,
    alignSelection,
  };
}
