import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { applyCodexVariant, rejectCodexVariant } from "../../shared/api/codex";
import { buildGalleryCardTree, galleryCardsForRun } from "../../features/codex/CodexCanvasGallery";
import type { CodexRun, CodexRunVariant, ObjectNode } from "../../shared/types/editor";

type FocusedCodexVariantSession = {
  run: CodexRun;
  variantId: string;
};

export function useCodexGalleryController(config: {
  activeFigureId: string;
  setRightPanelMode: Dispatch<SetStateAction<"inspector" | "codex">>;
  onStatus: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [codexGalleryRun, setCodexGalleryRun] = useState<CodexRun | null>(null);
  const [codexGalleryVisible, setCodexGalleryVisible] = useState(false);
  const [focusedGalleryCardId, setFocusedGalleryCardId] = useState("");
  const [focusedCodexVariantSession, setFocusedCodexVariantSession] = useState<FocusedCodexVariantSession | null>(null);

  useEffect(() => {
    const onCodexGallerySync = (event: Event): void => {
      const detail = (event as CustomEvent<{ run: CodexRun | null }>).detail;
      if (!detail?.run) {
        return;
      }
      setCodexGalleryRun(detail.run);
      setCodexGalleryVisible(true);
    };
    window.addEventListener("paper_figures:codex_gallery_sync", onCodexGallerySync as EventListener);
    return () => window.removeEventListener("paper_figures:codex_gallery_sync", onCodexGallerySync as EventListener);
  }, []);

  useEffect(() => {
    const onVariantFocus = (event: Event): void => {
      const detail = (event as CustomEvent<{ run: CodexRun; variant: { id: string } }>).detail;
      if (!detail?.run || !detail?.variant?.id) {
        return;
      }
      setCodexGalleryRun(detail.run);
      setCodexGalleryVisible(true);
      setFocusedCodexVariantSession({ run: detail.run, variantId: detail.variant.id });
      config.setRightPanelMode("inspector");
    };
    const onRunRefresh = (event: Event): void => {
      const detail = (event as CustomEvent<{ run: CodexRun }>).detail;
      if (!detail?.run) {
        return;
      }
      setCodexGalleryRun((current) => (current?.id === detail.run.id ? detail.run : current));
      setFocusedCodexVariantSession((current) => {
        if (!current || current.run.id !== detail.run.id) {
          return current;
        }
        return { run: detail.run, variantId: current.variantId };
      });
    };
    window.addEventListener("paper_figures:codex_variant_focus", onVariantFocus as EventListener);
    window.addEventListener("paper_figures:codex_run_refresh", onRunRefresh as EventListener);
    return () => {
      window.removeEventListener("paper_figures:codex_variant_focus", onVariantFocus as EventListener);
      window.removeEventListener("paper_figures:codex_run_refresh", onRunRefresh as EventListener);
    };
  }, [config.setRightPanelMode]);

  useEffect(() => {
    if (!codexGalleryRun) {
      return;
    }
    if (codexGalleryRun.targetFigureId && codexGalleryRun.targetFigureId !== config.activeFigureId) {
      setCodexGalleryRun(null);
      setCodexGalleryVisible(false);
    }
  }, [codexGalleryRun, config.activeFigureId]);

  useEffect(() => {
    setFocusedCodexVariantSession((current) => {
      if (!current) {
        return null;
      }
      if (current.run.targetFigureId && current.run.targetFigureId !== config.activeFigureId) {
        return null;
      }
      const variant = current.run.variants.find((item) => item.id === current.variantId) ?? null;
      if (!variant || variant.reviewState !== "pending" || !variant.controlManifest) {
        return null;
      }
      return current;
    });
  }, [config.activeFigureId]);

  const galleryCards = useMemo(() => (codexGalleryRun ? galleryCardsForRun(codexGalleryRun) : []), [codexGalleryRun]);

  useEffect(() => {
    if (!galleryCards.length) {
      setFocusedGalleryCardId("");
      return;
    }
    if (!galleryCards.some((card) => card.id === focusedGalleryCardId)) {
      setFocusedGalleryCardId(galleryCards[0]?.id ?? "");
    }
  }, [focusedGalleryCardId, galleryCards]);

  const focusedGalleryCard = useMemo(
    () => galleryCards.find((card) => card.id === focusedGalleryCardId) ?? galleryCards[0] ?? null,
    [focusedGalleryCardId, galleryCards],
  );
  const galleryObjectTree = useMemo<ObjectNode[]>(() => buildGalleryCardTree(focusedGalleryCard), [focusedGalleryCard]);
  const focusedCodexVariant = useMemo(
    () => focusedCodexVariantSession?.run.variants.find((variant) => variant.id === focusedCodexVariantSession.variantId) ?? null,
    [focusedCodexVariantSession],
  );

  useEffect(() => {
    if (focusedCodexVariantSession && !focusedCodexVariant) {
      setFocusedCodexVariantSession(null);
    }
  }, [focusedCodexVariant, focusedCodexVariantSession]);

  const toggleCodexGallery = useCallback((): void => {
    if (!codexGalleryRun) {
      return;
    }
    setCodexGalleryVisible((current) => !current);
  }, [codexGalleryRun]);

  const handleApplyCodexVariant = useCallback(async (variant: CodexRunVariant): Promise<void> => {
    try {
      const response = await applyCodexVariant(variant.id);
      window.dispatchEvent(new CustomEvent("paper_figures:codex_run_refresh", { detail: { run: response.run } }));
      setFocusedCodexVariantSession(null);
      config.onStatus(`Applied ${variant.label}.`, "success");
    } catch (error) {
      config.onStatus(error instanceof Error ? error.message : "Failed to apply Codex variant.", "error");
    }
  }, [config.onStatus]);

  const handleRejectCodexVariant = useCallback(async (variant: CodexRunVariant): Promise<void> => {
    try {
      const response = await rejectCodexVariant(variant.id);
      window.dispatchEvent(new CustomEvent("paper_figures:codex_run_refresh", { detail: { run: response.run } }));
      setFocusedCodexVariantSession(null);
      config.onStatus(`Rejected ${variant.label}.`, "info");
    } catch (error) {
      config.onStatus(error instanceof Error ? error.message : "Failed to reject Codex variant.", "error");
    }
  }, [config.onStatus]);

  return {
    codexGalleryRun,
    codexGalleryVisible,
    focusedGalleryCardId,
    setFocusedGalleryCardId,
    focusedCodexVariantSession,
    setFocusedCodexVariantSession,
    focusedCodexVariant,
    galleryObjectTree,
    toggleCodexGallery,
    handleApplyCodexVariant,
    handleRejectCodexVariant,
  };
}
