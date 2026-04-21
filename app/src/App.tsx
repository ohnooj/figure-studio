import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCanvasInteractions } from "./app/hooks/useCanvasInteractions";
import { useCodexAnnotations } from "./app/hooks/useCodexAnnotations";
import { useDebugLog } from "./app/hooks/useDebugLog";
import { useEditorClipboard } from "./app/hooks/useEditorClipboard";
import { useEditorHistory } from "./app/hooks/useEditorHistory";
import { useEditorSelection } from "./app/hooks/useEditorSelection";
import { useFigureCanvasLifecycle } from "./app/hooks/useFigureCanvasLifecycle";
import { useFigurePersistence } from "./app/hooks/useFigurePersistence";
import { useHierarchyActions } from "./app/hooks/useHierarchyActions";
import { useHistoryActions } from "./app/hooks/useHistoryActions";
import { useInspectorActions } from "./app/hooks/useInspectorActions";
import { useKeyboardShortcuts } from "./app/hooks/useKeyboardShortcuts";
import { usePaneResizers } from "./app/hooks/usePaneResizers";
import { useStudioPanels } from "./app/hooks/useStudioPanels";
import { useStudioChrome } from "./app/hooks/useStudioChrome";
import { useTextEditing } from "./app/hooks/useTextEditing";
import { useViewportState } from "./app/hooks/useViewportState";
import { useWorkspaceStudio } from "./app/hooks/useWorkspaceStudio";
import { buildGalleryCardTree, galleryCardsForRun } from "./features/codex/CodexCanvasGallery";
import { AppToolbar } from "./features/shell/AppToolbar";
import { HotkeysOverlay } from "./features/shell/HotkeysOverlay";
import { NotificationHistoryOverlay } from "./features/shell/NotificationHistoryOverlay";
import { StudioLayout } from "./features/shell/StudioLayout";
import { Toast } from "./features/shell/Toast";
import { BackendBlocker } from "./features/workspace/BackendBlocker";
import { TemplatePickerModal } from "./features/workspace/TemplatePickerModal";
import { selectedFromElement } from "./shared/lib/svg/selection";
import type { CodexRun, CodexSelectedObjectSummary, InteractionMode, NotificationEntry, ToastTone, ToolMode } from "./shared/types/editor";

export default function App() {
  const {
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
  } = useStudioChrome();
  const {
    workspace,
    setWorkspace,
    templates,
    sources,
    setSources,
    assets,
    activeFigureId,
    backendState,
    actionState,
    setActionState,
    status,
    setStatus,
    renamingFigureId,
    renameDraft,
    setRenameDraft,
    templatePickerOpen,
    setTemplatePickerOpen,
    activeFigureRef,
    loadAssets,
    loadFigure,
    createFigure,
    beginRename,
    cancelRename,
    commitRename,
  } = useWorkspaceStudio();

  const [interactionMode, setInteractionMode] = useState<InteractionMode>("resize");
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationEntries, setNotificationEntries] = useState<NotificationEntry[]>([]);
  const [codexGalleryRun, setCodexGalleryRun] = useState<CodexRun | null>(null);
  const [codexGalleryVisible, setCodexGalleryVisible] = useState(false);
  const [focusedGalleryCardId, setFocusedGalleryCardId] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeValue, setNewAttributeValue] = useState("");
  const [treeDropTarget, setTreeDropTarget] = useState("none");
  const [rightPanelMode, setRightPanelMode] = useState<"inspector" | "codex">("codex");
  const [hoveredObjectId, setHoveredObjectId] = useState("");

  const previewRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const selectionOverlayRef = useRef<HTMLDivElement | null>(null);
  const objectHierarchyRef = useRef<HTMLDivElement | null>(null);
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const leftBottomSectionsRef = useRef<HTMLDivElement | null>(null);
  const codexBottomSectionsRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const treeDragIdsRef = useRef<string[]>([]);
  const debugLog = useDebugLog(debugLogging);

  function showToast(message: string, tone: ToastTone = "success"): void {
    setToast({ message, tone });
    if (tone === "error") {
      setNotificationEntries((current) => [
        {
          id: `notification-${Date.now()}-${current.length}`,
          message,
          tone,
          createdAt: Date.now(),
        },
        ...current,
      ]);
    }
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }

  function openNotificationHistory(): void {
    setNotificationsOpen(true);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }

  const {
    viewport,
    setViewport,
    cursorPoint,
    setCursorPoint,
    spacePressedRef,
    fitViewport,
    figurePointFromClient,
    handleViewportWheel,
    handleViewportPointerDown,
    rulerMarks,
  } = useViewportState(canvasViewportRef, debugLog);

  const {
    selected,
    selectedIds,
    selectionBox,
    objectTree,
    selectedAttributes,
    selectedResolvedStyle,
    selectedInspectorCapabilities,
    svgRoot,
    selectedElement,
    selectedElements,
    elementById,
    editableTextNode,
    refreshSelection,
    refreshSelectionOverlay,
    setLiveSelectionView,
    mountSvgSource,
    currentSvgString,
    selectById,
  } = useEditorSelection({
    svgHostRef,
    canvasViewportRef,
    selectedIdsRef,
    debugLog,
  });

  const { pushHistoryCheckpoint, undo: popUndoSnapshot, redo: popRedoSnapshot } = useEditorHistory();
  const activeSource = activeFigureId ? sources[activeFigureId] : null;
  const activeAssets = activeFigureId ? assets[activeFigureId] : null;
  const selectedObjectSummaries: CodexSelectedObjectSummary[] = selectedElements().map((item) => selectedFromElement(item));
  const currentEditorSnapshot = useCallback(() => {
    const root = svgRoot();
    if (!root) {
      return null;
    }
    return {
      svg: currentSvgString(),
      description: descriptionDraft,
      selectedIds: selectedIdsRef.current,
      viewport,
    };
  }, [currentSvgString, descriptionDraft, selectedIdsRef, svgRoot, viewport]);
  const handleCodexStatus = useCallback((message: string, tone: "success" | "error" | "info" = "info"): void => {
    setStatus(message);
    showToast(message, tone);
  }, [setStatus]);
  const handleAlignmentToggle = useCallback((): void => {
    setAlignmentEnabled((current) => {
      const next = !current;
      const message = next ? "Alignment snap enabled." : "Alignment snap disabled.";
      setStatus(message);
      showToast(message, "info");
      return next;
    });
  }, [setAlignmentEnabled, setStatus]);

  const {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    scheduleSave,
    saveFigureState,
    exportFigureAssets,
    publishFigure,
    importAssetToSlot,
    uploadFiles,
  } = useFigurePersistence({
    activeFigureId,
    activeFigureRef,
    sources,
    setSources,
    setWorkspace,
    loadAssets,
    currentSvgString,
    svgRoot,
    refreshSelection,
    descriptionDraft,
    setDescriptionDraft,
    actionState,
    setActionState,
    setStatus,
    showToast,
    debugLog,
  });

  const {
    codexAnnotations,
    selectedCodexAnnotationId,
    setSelectedCodexAnnotationId,
    hoveredCodexAnnotationId,
    setHoveredCodexAnnotationId,
    codexAnnotationTool,
    setCodexAnnotationTool,
    codexAnnotationColor,
    setCodexAnnotationColor,
    codexFigureContext,
    handleCodexCanvasPointerDown,
    handleCodexCanvasPointerMove,
    handleCodexCanvasPointerUp,
    addSelectionAnnotation,
    deleteCodexAnnotation,
    deleteSelectedCodexAnnotation,
    clearCodexAnnotations,
    selectAllCodexAnnotations,
    copySelectedCodexAnnotation,
    codexSnapshot,
    restoreCodexSnapshot,
  } = useCodexAnnotations({
    activeFigureId,
    activeSource,
    selectedObjectSummaries,
    figurePointFromClient,
    currentEditorSnapshot,
    pushHistoryCheckpoint,
  });

  const {
    currentSnapshot,
    undo,
    redo,
  } = useHistoryActions({
    activeFigureRef,
    selectedIdsRef,
    descriptionDraft,
    viewport,
    codexSnapshot,
    currentSvgString,
    svgRoot,
    setViewport,
    setDescriptionDraft,
    setHasUnsavedChanges,
    setSources,
    setStatus,
    restoreCodexSnapshot,
    popUndoSnapshot,
    popRedoSnapshot,
    debugLog,
  });
  const {
    editingTextId,
    editingTextValue,
    editingTextBox,
    setEditingTextValue,
    syncEditingTextBox,
    beginTextEdit,
    cancelTextEdit,
    commitTextEdit,
  } = useTextEditing({
    canvasViewportRef,
    elementById,
    editableTextNode,
    refreshSelection,
    pushHistoryCheckpoint: (key = "edit", force = false) => pushHistoryCheckpoint(activeFigureId, currentSnapshot(), key, force),
    scheduleSave,
  });

  const {
    copySelection,
    pasteSelection,
    selectAllObjects,
  } = useEditorClipboard({
    activeFigureId,
    currentSnapshot,
    pushHistoryCheckpoint,
    svgRoot,
    selectedElements,
    refreshSelection,
    scheduleSave,
    setStatus,
    debugLog,
  });

  const {
    deleteSelected,
    groupSelected,
    ungroupSelected,
    moveNodeInTree,
    renameNodeLabel,
  } = useHierarchyActions({
    activeFigureId,
    currentSnapshot,
    pushHistoryCheckpoint,
    svgRoot,
    selectedElement,
    selectedElements,
    elementById,
    refreshSelection,
    scheduleSave,
    setStatus,
    debugLog,
    selectedIdsRef,
  });

  const {
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
    previewStyleString,
    changeStyleString,
    alignSelection,
  } = useInspectorActions({
    activeFigureId,
    currentSnapshot,
    pushHistoryCheckpoint,
    selected,
    svgRoot,
    selectedElement,
    selectedElements,
    editableTextNode,
    refreshSelection,
    scheduleSave,
    setStatus,
    setViewport,
    newAttributeName,
    setNewAttributeName,
    newAttributeValue,
    setNewAttributeValue,
  });

  const {
    startOuterResize,
    startObjectResize,
    startCodexMarksResize,
    startBottomResize,
  } = usePaneResizers({
    previewRef,
    leftBottomSectionsRef,
    codexBottomSectionsRef,
    setLeftWidth,
    setRightWidth,
    setObjectSectionHeight,
    setCodexMarksHeight,
    setBottomPanelHeight,
  });

  const {
    marqueeBox,
    alignmentGuides,
    handleCanvasSelect,
    startPointerOperation,
  } = useCanvasInteractions({
    activeFigureId,
    currentSnapshot,
    pushHistoryCheckpoint,
    toolMode,
    setToolMode,
    interactionMode,
    alignmentEnabled,
    selected,
    viewport,
    canvasViewportRef,
    selectionOverlayRef,
    svgRoot,
    selectedElement,
    selectedElements,
    elementById,
    refreshSelection,
    refreshSelectionOverlay,
    setLiveSelectionView,
    figurePointFromClient,
    beginTextEdit,
    scheduleSave,
    debugLog,
  });

  function handleTreeDragStart(id: string): void {
    treeDragIdsRef.current = selectedIds.includes(id) ? [...selectedIds] : [id];
  }

  function handleTreeDropTarget(targetId: string | null): void {
    const dragIds = treeDragIdsRef.current;
    treeDragIdsRef.current = [];
    setTreeDropTarget("none");
    if (!dragIds.length || dragIds.includes(targetId ?? "")) {
      return;
    }
    moveNodeInTree(dragIds, targetId);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onCodexGallerySync = (event: Event): void => {
      const detail = (event as CustomEvent<{ run: CodexRun | null }>).detail;
      if (detail?.run) {
        setCodexGalleryRun(detail.run);
        setCodexGalleryVisible(true);
        return;
      }
    };
    window.addEventListener("paper_figures:codex_gallery_sync", onCodexGallerySync as EventListener);
    return () => window.removeEventListener("paper_figures:codex_gallery_sync", onCodexGallerySync as EventListener);
  }, []);

  useEffect(() => {
    if (!codexGalleryRun) {
      return;
    }
    if (codexGalleryRun.targetFigureId && codexGalleryRun.targetFigureId !== activeFigureId) {
      setCodexGalleryRun(null);
      setCodexGalleryVisible(false);
    }
  }, [activeFigureId, codexGalleryRun]);

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
  const galleryObjectTree = useMemo(() => buildGalleryCardTree(focusedGalleryCard), [focusedGalleryCard]);

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

  useEffect(() => {
    const savedRightPanelMode = window.localStorage.getItem("paper_figures.rightPanelMode");
    if (savedRightPanelMode === "inspector" || savedRightPanelMode === "codex") {
      setRightPanelMode(savedRightPanelMode);
    }
    const savedToolMode = window.localStorage.getItem("paper_figures.toolMode");
    if (
      savedToolMode === "select" ||
      savedToolMode === "rectangle" ||
      savedToolMode === "rounded-rectangle" ||
      savedToolMode === "ellipse" ||
      savedToolMode === "line" ||
      savedToolMode === "arrow" ||
      savedToolMode === "text" ||
      savedToolMode === "image-slot" ||
      savedToolMode === "curve"
    ) {
      setToolMode(savedToolMode);
    }
    const savedInteractionMode = window.localStorage.getItem("paper_figures.interactionMode");
    if (savedInteractionMode === "resize" || savedInteractionMode === "scale") {
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
    if (toolMode === "select") {
      return;
    }
    refreshSelection(null);
  }, [refreshSelection, toolMode]);

  const selectedCodexAnnotation = codexAnnotations.find((annotation) => annotation.id === selectedCodexAnnotationId) ?? null;
  const hoveredCodexAnnotation = codexAnnotations.find((annotation) => annotation.id === hoveredCodexAnnotationId) ?? null;
  const linkedObjectIds = hoveredCodexAnnotation?.selectedIds?.length
    ? hoveredCodexAnnotation.selectedIds
    : selectedCodexAnnotation?.selectedIds ?? [];

  useEffect(() => {
    const selectedAnnotationIds = new Set(selectedIds);
    const relatedAnnotation = codexAnnotations.find((annotation) => annotation.selectedIds?.some((id) => selectedAnnotationIds.has(id)));
    if (relatedAnnotation && relatedAnnotation.id !== selectedCodexAnnotationId) {
      setSelectedCodexAnnotationId(relatedAnnotation.id);
      return;
    }
    if (!relatedAnnotation && selectedIds.length && selectedCodexAnnotationId) {
      setSelectedCodexAnnotationId("");
    }
  }, [codexAnnotations, selectedCodexAnnotationId, selectedIds, setSelectedCodexAnnotationId]);

  useEffect(() => {
    if (!selectedCodexAnnotation?.selectedIds?.length) {
      return;
    }
    selectById(selectedCodexAnnotation.selectedIds[selectedCodexAnnotation.selectedIds.length - 1] ?? "", {
      rangeIds: selectedCodexAnnotation.selectedIds,
    });
  }, [selectById, selectedCodexAnnotation]);

  useEffect(() => {
    const root = svgRoot();
    if (!root) {
      return;
    }
    root.querySelectorAll("[data-editor-linked='true']").forEach((node) => node.removeAttribute("data-editor-linked"));
    root.querySelectorAll("[data-editor-hovered='true']").forEach((node) => node.removeAttribute("data-editor-hovered"));
    linkedObjectIds.forEach((id) => {
      root.querySelector<SVGElement>(`#${id}`)?.setAttribute("data-editor-linked", "true");
    });
    if (hoveredObjectId) {
      root.querySelector<SVGElement>(`#${hoveredObjectId}`)?.setAttribute("data-editor-hovered", "true");
    }
  }, [hoveredObjectId, linkedObjectIds, svgRoot]);

  useKeyboardShortcuts({
    canvasViewportRef,
    objectHierarchyRef,
    codexMode: rightPanelMode === "codex",
    hasCodexSelection: Boolean(selectedCodexAnnotationId),
    spacePressedRef,
    onSave: () => void saveFigureState({ force: true }),
    onUndo: undo,
    onRedo: redo,
    onCopy: copySelection,
    onPaste: pasteSelection,
    onGroup: groupSelected,
    onUngroup: ungroupSelected,
    onDelete: deleteSelected,
    onClearSelection: () => refreshSelection(null),
    onSelectAll: selectAllObjects,
    onFit: () => fitViewport(svgRoot()),
    onZoom100: () => setViewport((current) => ({ ...current, zoom: 1 })),
    onZoomIn: () =>
      setViewport((current) => ({ ...current, zoom: Math.min(8, Number((current.zoom * 1.1).toFixed(4)))})),
    onZoomOut: () =>
      setViewport((current) => ({ ...current, zoom: Math.max(0.1, Number((current.zoom / 1.1).toFixed(4)))})),
    onCodexCopy: copySelectedCodexAnnotation,
    onCodexPaste: copySelectedCodexAnnotation,
    onCodexGroup: addSelectionAnnotation,
    onCodexUndo: undo,
    onCodexRedo: redo,
    onCodexDelete: deleteSelectedCodexAnnotation,
    onCodexSelectAll: selectAllCodexAnnotations,
    onCodexClearSelection: () => setSelectedCodexAnnotationId(""),
  });

  const {
    toggleLeftRail,
    toggleRightRail,
    toggleObjectSection,
    toggleBottomPanel,
  } = useStudioPanels({
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
    objectSectionHeight,
    setObjectSectionHeight,
    bottomPanelHeight,
    setBottomPanelHeight,
    previewRef,
    leftBottomSectionsRef,
  });

  useFigureCanvasLifecycle({
    activeFigureId,
    activeSource,
    galleryVisible: rightPanelMode === "codex" && codexGalleryVisible,
    setDescriptionDraft,
    setHasUnsavedChanges,
    cancelTextEdit,
    mountSvgSource,
    svgRoot,
    svgHostRef,
    setViewport,
    fitViewport,
    refreshSelectionOverlay,
    editingTextId,
    syncEditingTextBox,
    selectedIds,
    viewportKey: `${viewport.panX}:${viewport.panY}:${viewport.zoom}:${viewport.artboardWidth}:${viewport.artboardHeight}`,
  });

  return (
    <div className={`studio-shell ${showHelpers ? "helpers-on" : "helpers-off"}`} data-theme={resolvedTheme}>
      {toast ? <Toast message={toast.message} tone={toast.tone} onClick={openNotificationHistory} /> : null}
      {hotkeysOpen ? <HotkeysOverlay onClose={() => setHotkeysOpen(false)} /> : null}
      {notificationsOpen ? (
        <NotificationHistoryOverlay
          entries={notificationEntries}
          onClose={() => setNotificationsOpen(false)}
        />
      ) : null}
      {templatePickerOpen ? (
        <TemplatePickerModal
          templates={templates}
          busy={actionState !== "idle"}
          onClose={() => setTemplatePickerOpen(false)}
          onCreate={(templateId) => void createFigure(templateId)}
        />
      ) : null}

      {backendState === "error" ? <BackendBlocker status={status} /> : null}

      <AppToolbar
        activeSource={activeSource}
        actionState={actionState}
        backendState={backendState}
        status={status}
        hasUnsavedChanges={hasUnsavedChanges}
        rightPanelMode={rightPanelMode}
        themePreference={themePreference}
        showHelpers={showHelpers}
        debugLogging={debugLogging}
        figures={workspace?.figures ?? []}
        activeFigureId={activeFigureId}
        renamingFigureId={renamingFigureId}
        renameDraft={renameDraft}
        figuresDisabled={backendState !== "ready" || actionState !== "idle"}
        onSave={() => void saveFigureState({ force: true })}
        onUndo={undo}
        onRedo={redo}
        onExport={() => void exportFigureAssets()}
        onPublish={() => void publishFigure()}
        onThemeChange={setThemePreference}
        onToggleHelpers={() => setShowHelpers((current) => !current)}
        onToggleDebugLogging={() => setDebugLogging((current) => !current)}
        onOpenHotkeys={() => setHotkeysOpen(true)}
        onOpenNotifications={openNotificationHistory}
        onRightPanelModeChange={setRightPanelMode}
        onSelectFigure={(figureId) => void loadFigure(figureId, true)}
        onBeginRenameFigure={beginRename}
        onRenameDraftChange={setRenameDraft}
        onCommitRenameFigure={(figureId) => void commitRename(figureId)}
        onCancelRenameFigure={cancelRename}
        onCreateFigure={() => setTemplatePickerOpen(true)}
      />

      <StudioLayout
        leftWidth={leftWidth}
        rightWidth={rightWidth}
        objectSectionHeight={objectSectionHeight}
        bottomPanelHeight={bottomPanelHeight}
        codexMarksHeight={codexMarksHeight}
              previewRef={previewRef}
              canvasViewportRef={canvasViewportRef}
              selectionOverlayRef={selectionOverlayRef}
              objectHierarchyRef={objectHierarchyRef}
        svgHostRef={svgHostRef}
        leftBottomSectionsRef={leftBottomSectionsRef}
        codexBottomSectionsRef={codexBottomSectionsRef}
        uploadRef={uploadRef}
        treeDropTarget={treeDropTarget}
        setTreeDropTarget={setTreeDropTarget}
        selected={selected}
        selectedIds={codexGalleryVisible ? [] : selectedIds}
        linkedObjectIds={codexGalleryVisible ? [] : linkedObjectIds}
        hoveredObjectId={codexGalleryVisible ? "" : hoveredObjectId}
        selectionBox={selectionBox}
        objectTree={codexGalleryVisible ? galleryObjectTree : objectTree}
        selectedAttributes={selectedAttributes}
        selectedResolvedStyle={selectedResolvedStyle}
        selectedInspectorCapabilities={selectedInspectorCapabilities}
        activeFigureId={activeFigureId}
        activeSource={activeSource}
        activeAssets={activeAssets ?? null}
        actionState={actionState}
        rightPanelMode={rightPanelMode}
        showHelpers={showHelpers}
        viewport={viewport}
        cursorPoint={cursorPoint}
        toolMode={toolMode}
        interactionMode={interactionMode}
        alignmentEnabled={alignmentEnabled}
        codexAnnotationTool={codexAnnotationTool}
        codexAnnotationColor={codexAnnotationColor}
        hasCodexSelection={Boolean(selectedIds.length)}
        codexAnnotations={codexAnnotations}
        selectedCodexAnnotationId={selectedCodexAnnotationId}
        hoveredCodexAnnotationId={hoveredCodexAnnotationId}
        codexFigureContext={codexFigureContext}
        codexGalleryRun={codexGalleryRun}
        codexGalleryVisible={codexGalleryVisible}
        focusedGalleryCardId={focusedGalleryCardId}
        marqueeBox={marqueeBox}
        alignmentGuides={alignmentGuides}
        editingTextId={editingTextId}
        editingTextValue={editingTextValue}
        editingTextBox={editingTextBox}
        rulerMarks={rulerMarks}
        descriptionDraft={descriptionDraft}
        newAttributeName={newAttributeName}
        newAttributeValue={newAttributeValue}
        onSelectTreeNode={codexGalleryVisible ? (() => undefined) : selectById}
        onFocusGalleryCard={setFocusedGalleryCardId}
        onHoverTreeNode={setHoveredObjectId}
        onRenameNodeLabel={codexGalleryVisible ? (() => undefined) : renameNodeLabel}
        onTreeDragStart={codexGalleryVisible ? (() => undefined) : handleTreeDragStart}
        onTreeDropTarget={codexGalleryVisible ? (() => undefined) : handleTreeDropTarget}
        onTreeDragEnd={() => {
          if (codexGalleryVisible) {
            return;
          }
          treeDragIdsRef.current = [];
          setTreeDropTarget("none");
        }}
        onDeleteCodexAnnotation={deleteCodexAnnotation}
        onSelectCodexAnnotation={setSelectedCodexAnnotationId}
        onHoverCodexAnnotation={setHoveredCodexAnnotationId}
        onAddSelectionAnnotation={addSelectionAnnotation}
        onClearCodexAnnotations={clearCodexAnnotations}
        onOpenUpload={() => uploadRef.current?.click()}
        onUploadFiles={(event) => void uploadFiles(event)}
        onRefreshAssets={() => void loadAssets(activeFigureId)}
        onStartObjectResize={startObjectResize}
        onStartCodexMarksResize={startCodexMarksResize}
        onToggleObjectSection={toggleObjectSection}
        onStartOuterResize={startOuterResize}
        onToggleLeftRail={toggleLeftRail}
        onToggleRightRail={toggleRightRail}
        onFitViewport={() => fitViewport(svgRoot())}
        onZoom100={() => setViewport((current) => ({ ...current, zoom: 1 }))}
        onGroupSelection={groupSelected}
        onUngroupSelection={ungroupSelected}
        onToolModeChange={setToolMode}
        onCodexAnnotationToolChange={setCodexAnnotationTool}
        onCodexAnnotationColorChange={setCodexAnnotationColor}
        onToggleCodexGallery={() => {
          if (!codexGalleryRun) {
            return;
          }
          setCodexGalleryVisible((current) => !current);
        }}
        onInteractionModeChange={setInteractionMode}
        onToggleAlignment={handleAlignmentToggle}
        onAlignSelection={alignSelection}
        onViewportPointerDown={handleViewportPointerDown}
        onViewportWheel={handleViewportWheel}
        onCursorMove={(clientX, clientY) => setCursorPoint(figurePointFromClient(clientX, clientY))}
        onCursorLeave={() => setCursorPoint(null)}
        onSelectEditable={handleCanvasSelect}
        onBeginTextEdit={beginTextEdit}
        onEditingTextChange={setEditingTextValue}
        onCommitTextEdit={commitTextEdit}
        onCancelTextEdit={cancelTextEdit}
        onImportAssetToSlot={(sourcePath, slotElement) => void importAssetToSlot(sourcePath, slotElement)}
        onCodexPointerDown={handleCodexCanvasPointerDown}
        onCodexPointerMove={handleCodexCanvasPointerMove}
        onCodexPointerUp={handleCodexCanvasPointerUp}
        onStartMove={(event) => startPointerOperation("move", event)}
        onStartResize={(event, handle) => startPointerOperation("resize", event, handle)}
        onStartBottomResize={startBottomResize}
        onToggleBottomPanel={toggleBottomPanel}
        onDescriptionDraftChange={(value) => {
          pushHistoryCheckpoint(activeFigureId, currentSnapshot(), "caption");
          setDescriptionDraft(value);
          scheduleSave();
        }}
        onCodexStatus={handleCodexStatus}
        onArtboardGeometryChange={changeArtboardGeometry}
        onArtboardGeometryPreview={previewArtboardGeometry}
        onGeometryChange={changeGeometry}
        onGeometryPreview={previewGeometry}
        onTextChange={changeText}
        onStyleNumberChange={changeStyleNumber}
        onStyleNumberPreview={previewStyleNumber}
        onStyleStringPreview={previewStyleString}
        onStyleStringChange={changeStyleString}
        onAttributeChange={changeAttribute}
        onNewAttributeNameChange={setNewAttributeName}
        onNewAttributeValueChange={setNewAttributeValue}
        onAddAttribute={addAttribute}
        onClearSlotImage={clearSlotImage}
      />
    </div>
  );
}
