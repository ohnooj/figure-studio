import { useEffect, useRef, useState, type ChangeEvent, type MutableRefObject } from "react";

import { uploadFigureAssets } from "../../shared/api/assets";
import { exportFigureBundle, publishFigureAssets, type ExportBundleResult } from "../../shared/api/export";
import { importFigureAsset, saveFigureSource, updateFigureMetadata } from "../../shared/api/figures";
import { absoluteAssetHref } from "../../shared/lib/svg/serialize";
import { endTraceOperation, startTraceOperation, traceOperationDuration } from "../../shared/lib/trace";
import { escapeLatex, targetForExtension } from "../../shared/lib/utils";
import type { ActionState, FigureEntry, FigureSource, ToastTone, Workspace } from "../../shared/types/editor";

function currentFigureDescription(
  figure: { id: string; description?: string },
  descriptionDraft: string,
  activeFigureId: string,
): string {
  if (figure.id === activeFigureId) {
    return descriptionDraft.trim();
  }
  return (figure.description ?? "").trim();
}

export function useFigurePersistence(config: {
  activeFigureId: string;
  activeFigureRef: MutableRefObject<string>;
  sources: Record<string, FigureSource>;
  setSources: React.Dispatch<React.SetStateAction<Record<string, FigureSource>>>;
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace | null>>;
  loadAssets: (figureId: string, quiet?: boolean) => Promise<void>;
  currentSvgString: () => string;
  svgRoot: () => SVGSVGElement | null;
  refreshSelection: (element?: SVGElement | null) => void;
  descriptionDraft: string;
  setDescriptionDraft: React.Dispatch<React.SetStateAction<string>>;
  actionState: ActionState;
  setActionState: React.Dispatch<React.SetStateAction<ActionState>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  showToast: (message: string, tone?: ToastTone) => void;
  debugLog?: (label: string, payload?: unknown) => void;
}) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const pendingSaveRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);

  function activeSource(): FigureSource | null {
    return config.activeFigureId ? config.sources[config.activeFigureId] : null;
  }

  function scheduleSave(): void {
    const operation = startTraceOperation(config.debugLog, "persistence.schedule-save", {
      activeFigureId: config.activeFigureId,
    });
    setHasUnsavedChanges(true);
    if (pendingSaveRef.current !== null) {
      window.clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }
    endTraceOperation(config.debugLog, operation, {
      activeFigureId: config.activeFigureId,
      pendingCleared: true,
    });
  }

  function latexCaptionForFigure(figure: FigureEntry): string {
    const description = currentFigureDescription(figure, config.descriptionDraft, config.activeFigureId);
    const body = description || `% Add caption for ${figure.id}`;
    return `\\caption{${escapeLatex(body)}}\n\\label{fig:${figure.id}}\n`;
  }

  async function exportBundle(source: FigureSource): Promise<ExportBundleResult> {
    const operation = startTraceOperation(config.debugLog, "persistence.export-bundle", {
      activeFigureId: source.figure.id,
    });
    const exportStartedAt = performance.now();
    const caption = targetForExtension(source.figure.publishTargets, ".tex") ? latexCaptionForFigure(source.figure) : undefined;
    const result = await exportFigureBundle(source.figure.id, config.currentSvgString(), caption);
    traceOperationDuration(config.debugLog, operation, "request", exportStartedAt, {
      figureId: source.figure.id,
      version: result.version,
    });
    endTraceOperation(config.debugLog, operation, {
      figureId: source.figure.id,
      version: result.version,
    });
    return result;
  }

  async function prepareExport(source: FigureSource): Promise<ExportBundleResult | null> {
    if (hasUnsavedChanges) {
      await saveFigureState({ quiet: true, force: true });
    }
    config.setActionState("exporting");
    return exportBundle(source);
  }

  async function saveFigureState(options?: { quiet?: boolean; force?: boolean }): Promise<void> {
    const figureId = config.activeFigureRef.current;
    const source = figureId ? config.sources[figureId] : null;
    const root = config.svgRoot();
    const operation = startTraceOperation(config.debugLog, "persistence.save", {
      figureId,
      quiet: Boolean(options?.quiet),
      force: Boolean(options?.force),
    });
    if (!figureId || !source || !root) {
      endTraceOperation(config.debugLog, operation, { skipped: true });
      return;
    }
    if (saveInFlightRef.current) {
      endTraceOperation(config.debugLog, operation, { skipped: true, reason: "save-in-flight" });
      return;
    }
    const serializeStartedAt = performance.now();
    const svg = config.currentSvgString();
    traceOperationDuration(config.debugLog, operation, "serialize", serializeStartedAt, {
      svgLength: svg.length,
    });
    try {
      saveInFlightRef.current = true;
      config.setActionState("saving");
      const requestStartedAt = performance.now();
      const [metadataPayload, sourcePayload] = await Promise.all([
        updateFigureMetadata(figureId, {
          title: source.figure.title,
          description: config.descriptionDraft,
        }),
        saveFigureSource(figureId, svg),
      ]);
      traceOperationDuration(config.debugLog, operation, "request", requestStartedAt, {
        sourceFileCount: sourcePayload.sourceFiles.length,
      });
      const applyStartedAt = performance.now();
      config.setWorkspace((current) =>
        current
          ? {
              ...current,
              figures: current.figures.map((item) => (item.id === figureId ? metadataPayload.figure : item)),
            }
          : current,
      );
      config.setSources((current) => ({
        ...current,
        [figureId]: {
          ...source,
          figure: metadataPayload.figure,
          svg,
          sourceFiles: sourcePayload.sourceFiles,
        },
      }));
      config.setDescriptionDraft(metadataPayload.figure.description ?? "");
      setHasUnsavedChanges(false);
      traceOperationDuration(config.debugLog, operation, "apply", applyStartedAt, {
        sourceFileCount: sourcePayload.sourceFiles.length,
      });
      if (!options?.quiet) {
        config.setStatus(`Saved ${figureId}.`);
        config.showToast("Saved", "success");
      }
      endTraceOperation(config.debugLog, operation, {
        figureId,
        sourceFileCount: sourcePayload.sourceFiles.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      config.setStatus(message);
      config.showToast(message, "error");
      endTraceOperation(config.debugLog, operation, {
        figureId,
        error: message,
      });
    } finally {
      saveInFlightRef.current = false;
      config.setActionState("idle");
    }
  }

  async function exportFigureAssetsFlow(): Promise<void> {
    const source = activeSource();
    if (!source) {
      return;
    }
    const operation = startTraceOperation(config.debugLog, "persistence.export", {
      figureId: source.figure.id,
    });
    try {
      const exported = await prepareExport(source);
      if (!exported) {
        endTraceOperation(config.debugLog, operation, {
          figureId: source.figure.id,
          skipped: true,
          reason: "no-export-result",
        });
        return;
      }
      if (!exported.pdf.ok && exported.pdf.message) {
        config.setStatus(`Exported ${source.figure.id} to ${exported.version}. PDF unavailable: ${exported.pdf.message}`);
        endTraceOperation(config.debugLog, operation, {
          figureId: source.figure.id,
          version: exported.version,
          pdfOk: false,
          message: exported.pdf.message,
        });
        return;
      }
      config.setStatus(`Exported ${source.figure.id} to ${exported.version}.`);
      endTraceOperation(config.debugLog, operation, {
        figureId: source.figure.id,
        version: exported.version,
        pdfOk: exported.pdf.ok,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      config.setStatus(message);
      config.showToast(message, "error");
      endTraceOperation(config.debugLog, operation, {
        figureId: source.figure.id,
        error: message,
      });
    } finally {
      config.setActionState("idle");
    }
  }

  async function publishFigure(): Promise<void> {
    const source = activeSource();
    if (!source) {
      return;
    }
    const operation = startTraceOperation(config.debugLog, "persistence.publish", {
      figureId: source.figure.id,
    });
    try {
      const exported = await prepareExport(source);
      if (!exported) {
        endTraceOperation(config.debugLog, operation, {
          figureId: source.figure.id,
          skipped: true,
          reason: "no-export-result",
        });
        return;
      }
      const sourcesToCopy: string[] = [exported.svgPath];
      const targetsToCopy: string[] = [];
      const svgTarget = targetForExtension(source.figure.publishTargets, ".svg");
      const pdfTarget = targetForExtension(source.figure.publishTargets, ".pdf");
      if (svgTarget) {
        targetsToCopy.push(svgTarget);
      }
      if (pdfTarget && exported.pdf.ok) {
        sourcesToCopy.push(exported.pdfPath);
        targetsToCopy.push(pdfTarget);
      }
      if (exported.textPath) {
        sourcesToCopy.push(exported.textPath);
        const textTarget = targetForExtension(source.figure.publishTargets, ".tex");
        if (textTarget) {
          targetsToCopy.push(textTarget);
        }
      }

      const publishStartedAt = performance.now();
      await publishFigureAssets(source.figure.id, sourcesToCopy, targetsToCopy);
      traceOperationDuration(config.debugLog, operation, "request", publishStartedAt, {
        sourceCount: sourcesToCopy.length,
        targetCount: targetsToCopy.length,
      });
      config.setStatus(`Published ${source.figure.id} from ${exported.version}.`);
      endTraceOperation(config.debugLog, operation, {
        figureId: source.figure.id,
        version: exported.version,
        sourceCount: sourcesToCopy.length,
        targetCount: targetsToCopy.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed.";
      config.setStatus(message);
      config.showToast(message, "error");
      endTraceOperation(config.debugLog, operation, {
        figureId: source.figure.id,
        error: message,
      });
    } finally {
      config.setActionState("idle");
    }
  }

  async function importAssetToSlot(sourcePath: string, slotElement: SVGElement): Promise<void> {
    if (!config.activeFigureRef.current) {
      return;
    }
    const operation = startTraceOperation(config.debugLog, "persistence.import-asset", {
      figureId: config.activeFigureRef.current,
      slotId: slotElement.id || "slot",
      sourcePath,
    });
    try {
      const requestStartedAt = performance.now();
      const payload = await importFigureAsset(config.activeFigureRef.current, sourcePath);
      traceOperationDuration(config.debugLog, operation, "request", requestStartedAt, {
        relativePath: payload.relativePath,
      });
      const applyStartedAt = performance.now();
      slotElement.setAttribute("data-asset-path", payload.relativePath);
      slotElement.setAttribute("href", absoluteAssetHref(config.activeFigureRef.current, payload.relativePath));
      slotElement.setAttribute("opacity", "1");
      const placeholderId = slotElement.getAttribute("data-placeholder-id");
      if (placeholderId) {
        const root = config.svgRoot();
        const placeholder = root?.querySelector<SVGElement>(`#${placeholderId}`);
        placeholder?.setAttribute("display", "none");
      }
      config.refreshSelection(slotElement);
      traceOperationDuration(config.debugLog, operation, "apply", applyStartedAt, {
        relativePath: payload.relativePath,
      });
      await config.loadAssets(config.activeFigureRef.current, true);
      scheduleSave();
      config.setStatus(`Assigned ${payload.relativePath} to ${slotElement.id || "slot"}.`);
      endTraceOperation(config.debugLog, operation, {
        relativePath: payload.relativePath,
        slotId: slotElement.id || "slot",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image import failed.";
      config.setStatus(message);
      config.showToast(message, "error");
      endTraceOperation(config.debugLog, operation, {
        error: message,
        slotId: slotElement.id || "slot",
      });
    }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = event.target.files;
    if (!files?.length || !config.activeFigureId) {
      return;
    }
    const operation = startTraceOperation(config.debugLog, "persistence.upload-assets", {
      figureId: config.activeFigureId,
      fileCount: files.length,
    });
    try {
      config.setActionState("saving");
      const requestStartedAt = performance.now();
      const payload = await uploadFigureAssets(config.activeFigureId, files);
      traceOperationDuration(config.debugLog, operation, "request", requestStartedAt, {
        importedCount: payload.imported?.length ?? 0,
      });
      await config.loadAssets(config.activeFigureId, true);
      config.setStatus(`Imported ${payload.imported?.length ?? 0} file(s) into assets.`);
      endTraceOperation(config.debugLog, operation, {
        importedCount: payload.imported?.length ?? 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      config.setStatus(message);
      config.showToast(message, "error");
      endTraceOperation(config.debugLog, operation, {
        error: message,
      });
    } finally {
      config.setActionState("idle");
      event.target.value = "";
    }
  }

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current !== null) {
        window.clearTimeout(pendingSaveRef.current);
      }
    };
  }, []);

  return {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    scheduleSave,
    saveFigureState,
    exportFigureAssets: exportFigureAssetsFlow,
    publishFigure,
    importAssetToSlot,
    uploadFiles,
  };
}
