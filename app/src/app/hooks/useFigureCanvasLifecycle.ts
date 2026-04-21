import { useEffect } from "react";
import type * as React from "react";

import { svgViewBox } from "../../shared/lib/svg/document";
import type { FigureSource, ViewportState } from "../../shared/types/editor";

export function useFigureCanvasLifecycle(config: {
  activeFigureId: string;
  activeSource: FigureSource | null;
  galleryVisible: boolean;
  setDescriptionDraft: React.Dispatch<React.SetStateAction<string>>;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  cancelTextEdit: () => void;
  mountSvgSource: (source: FigureSource) => void;
  svgRoot: () => SVGSVGElement | null;
  svgHostRef: React.RefObject<HTMLDivElement | null>;
  setViewport: React.Dispatch<React.SetStateAction<ViewportState>>;
  fitViewport: (root: SVGSVGElement | null) => void;
  refreshSelectionOverlay: (element?: SVGElement | SVGElement[] | null) => void;
  editingTextId: string;
  syncEditingTextBox: (id: string) => void;
  selectedIds: string[];
  viewportKey: string;
}) {
  useEffect(() => {
    config.setDescriptionDraft(config.activeSource?.figure.description ?? "");
    config.setHasUnsavedChanges(false);
    config.cancelTextEdit();
  }, [config.activeFigureId, config.activeSource, config.setDescriptionDraft, config.setHasUnsavedChanges, config.cancelTextEdit]);

  useEffect(() => {
    if (config.galleryVisible) {
      return;
    }
    if (config.activeSource) {
      config.mountSvgSource(config.activeSource);
      const liveRoot = config.svgRoot();
      const artboard = svgViewBox(liveRoot);
      config.setViewport((current) => ({
        ...current,
        artboardWidth: artboard.width,
        artboardHeight: artboard.height,
      }));
    } else if (config.svgHostRef.current) {
      config.svgHostRef.current.innerHTML = "";
    }
  }, [config.activeFigureId, config.activeSource, config.galleryVisible, config.mountSvgSource, config.svgRoot, config.setViewport, config.svgHostRef]);

  useEffect(() => {
    if (config.galleryVisible || !config.activeFigureId || !config.activeSource) {
      return;
    }
    requestAnimationFrame(() => {
      const root = config.svgRoot();
      if (root) {
        config.fitViewport(root);
      }
    });
  }, [config.activeFigureId, config.activeSource, config.galleryVisible, config.fitViewport, config.svgRoot]);

  useEffect(() => {
    if (config.selectedIds.length) {
      config.refreshSelectionOverlay();
    }
  }, [config.viewportKey, config.selectedIds.length, config.refreshSelectionOverlay]);

  useEffect(() => {
    if (config.editingTextId) {
      config.syncEditingTextBox(config.editingTextId);
    }
  }, [config.viewportKey, config.editingTextId, config.syncEditingTextBox]);

  useEffect(() => {
    if (config.editingTextId && !config.selectedIds.includes(config.editingTextId)) {
      config.cancelTextEdit();
    }
  }, [config.selectedIds, config.editingTextId, config.cancelTextEdit]);
}
