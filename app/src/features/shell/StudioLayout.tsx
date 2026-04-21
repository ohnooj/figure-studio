import type * as React from "react";

import { DEFAULT_BOTTOM_HEIGHT } from "../../app/constants";
import { AssetsPanel } from "../assets/AssetsPanel";
import { CanvasViewport } from "../canvas/CanvasViewport";
import { AnnotationMarksPanel } from "../codex/AnnotationMarksPanel";
import { CodexCanvasGallery } from "../codex/CodexCanvasGallery";
import { AttachedPayloadPanel } from "../codex/AttachedPayloadPanel";
import { CodexWorkspace } from "../codex/CodexWorkspace";
import { ObjectTreeView } from "../hierarchy/ObjectTreeView";
import { CaptionPanel } from "../inspector/CaptionPanel";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { CanvasToolbar } from "./CanvasToolbar";
import type {
  ActionState,
  AlignmentGuide,
  AttributeEntry,
  CodexAnnotation,
  CodexAnnotationTool,
  CodexFigureContext,
  CodexRun,
  FigureAssets,
  FigureSource,
  InspectorCapabilities,
  InspectorStyle,
  InteractionMode,
  ObjectNode,
  SelectedElement,
  SelectionBox,
  ToolMode,
  ViewportState,
} from "../../shared/types/editor";

export function StudioLayout(props: {
  leftWidth: number;
  rightWidth: number;
  objectSectionHeight: number;
  codexMarksHeight: number;
  bottomPanelHeight: number;
  previewRef: React.Ref<HTMLDivElement>;
  canvasViewportRef: React.Ref<HTMLDivElement>;
  selectionOverlayRef: React.Ref<HTMLDivElement>;
  objectHierarchyRef: React.MutableRefObject<HTMLDivElement | null>;
  svgHostRef: React.Ref<HTMLDivElement>;
  leftBottomSectionsRef: React.Ref<HTMLDivElement>;
  codexBottomSectionsRef: React.Ref<HTMLDivElement>;
  uploadRef: React.Ref<HTMLInputElement>;
  treeDropTarget: string;
  setTreeDropTarget: React.Dispatch<React.SetStateAction<string>>;
  selected: SelectedElement | null;
  selectedIds: string[];
  linkedObjectIds: string[];
  hoveredObjectId: string;
  selectionBox: SelectionBox | null;
  objectTree: ObjectNode[];
  selectedAttributes: AttributeEntry[];
  selectedResolvedStyle: InspectorStyle | null;
  selectedInspectorCapabilities: InspectorCapabilities | null;
  activeFigureId: string;
  activeSource: FigureSource | null;
  activeAssets: FigureAssets | null;
  actionState: ActionState;
  rightPanelMode: "inspector" | "codex";
  showHelpers: boolean;
  viewport: ViewportState;
  cursorPoint: { x: number; y: number } | null;
  toolMode: ToolMode;
  interactionMode: InteractionMode;
  alignmentEnabled: boolean;
  codexAnnotationTool: CodexAnnotationTool;
  codexAnnotationColor: string;
  hasCodexSelection: boolean;
  codexAnnotations: CodexAnnotation[];
  selectedCodexAnnotationId: string;
  hoveredCodexAnnotationId: string;
  codexFigureContext: CodexFigureContext | null;
  codexGalleryRun: CodexRun | null;
  codexGalleryVisible: boolean;
  focusedGalleryCardId: string;
  marqueeBox: { left: number; top: number; width: number; height: number } | null;
  alignmentGuides: AlignmentGuide[];
  editingTextId: string;
  editingTextValue: string;
  editingTextBox: SelectionBox | null;
  rulerMarks: number[];
  descriptionDraft: string;
  newAttributeName: string;
  newAttributeValue: string;
  onSelectTreeNode: (id: string, options?: { additive?: boolean; toggle?: boolean }) => void;
  onFocusGalleryCard: (cardId: string) => void;
  onHoverTreeNode: (id: string) => void;
  onRenameNodeLabel: (id: string, value: string) => void;
  onTreeDragStart: (id: string) => void;
  onTreeDropTarget: (targetId: string | null) => void;
  onTreeDragEnd: () => void;
  onDeleteCodexAnnotation: (annotationId: string) => void;
  onSelectCodexAnnotation: (annotationId: string) => void;
  onHoverCodexAnnotation: (annotationId: string) => void;
  onAddSelectionAnnotation: () => void;
  onClearCodexAnnotations: () => void;
  onOpenUpload: () => void;
  onUploadFiles: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRefreshAssets: () => void;
  onStartObjectResize: (event: React.MouseEvent<HTMLDivElement>) => void;
  onStartCodexMarksResize: (event: React.MouseEvent<HTMLDivElement>) => void;
  onToggleObjectSection: () => void;
  onStartOuterResize: (side: "left" | "right", event: React.MouseEvent<HTMLDivElement>) => void;
  onToggleLeftRail: () => void;
  onToggleRightRail: () => void;
  onFitViewport: () => void;
  onZoom100: () => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onToolModeChange: React.Dispatch<React.SetStateAction<ToolMode>>;
  onCodexAnnotationToolChange: React.Dispatch<React.SetStateAction<CodexAnnotationTool>>;
  onCodexAnnotationColorChange: React.Dispatch<React.SetStateAction<string>>;
  onToggleCodexGallery: () => void;
  onInteractionModeChange: React.Dispatch<React.SetStateAction<InteractionMode>>;
  onToggleAlignment: () => void;
  onAlignSelection: (mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "same-width" | "same-height") => void;
  onViewportPointerDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onViewportWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onCursorMove: (clientX: number, clientY: number) => void;
  onCursorLeave: () => void;
  onSelectEditable: (editable: SVGElement | null, options?: { additive?: boolean; toggle?: boolean; event?: React.PointerEvent<HTMLDivElement> }) => void;
  onBeginTextEdit: (element: SVGElement | null) => void;
  onEditingTextChange: React.Dispatch<React.SetStateAction<string>>;
  onCommitTextEdit: () => void;
  onCancelTextEdit: () => void;
  onImportAssetToSlot: (sourcePath: string, slotElement: SVGElement) => void;
  onCodexPointerDown: (event: React.PointerEvent<HTMLDivElement>) => boolean;
  onCodexPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCodexPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onStartMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onStartResize: (event: React.MouseEvent<HTMLDivElement>, handle: string) => void;
  onStartBottomResize: (event: React.MouseEvent<HTMLDivElement>) => void;
  onToggleBottomPanel: () => void;
  onDescriptionDraftChange: (value: string) => void;
  onCodexStatus: (message: string, tone?: "success" | "error" | "info") => void;
  onArtboardGeometryChange: (axis: "width" | "height", value: number) => void;
  onArtboardGeometryPreview: (axis: "width" | "height", value: number) => void;
  onGeometryChange: (axis: "x" | "y" | "width" | "height" | "rotation", value: number) => void;
  onGeometryPreview: (axis: "x" | "y" | "width" | "height" | "rotation", value: number) => void;
  onTextChange: (value: string) => void;
  onStyleNumberChange: (name: "stroke-width" | "opacity" | "fill-opacity" | "stroke-opacity" | "rx" | "ry" | "font-size", value: number) => void;
  onStyleNumberPreview: (name: "stroke-width" | "opacity" | "fill-opacity" | "stroke-opacity" | "rx" | "ry" | "font-size", value: number) => void;
  onStyleStringPreview: (name: "fill" | "stroke" | "stroke-dasharray" | "stroke-linecap" | "stroke-linejoin" | "font-family" | "font-weight" | "font-style" | "text-anchor", value: string) => void;
  onStyleStringChange: (name: "fill" | "stroke" | "stroke-dasharray" | "stroke-linecap" | "stroke-linejoin" | "font-family" | "font-weight" | "font-style" | "text-anchor", value: string) => void;
  onAttributeChange: (name: string, value: string) => void;
  onNewAttributeNameChange: React.Dispatch<React.SetStateAction<string>>;
  onNewAttributeValueChange: React.Dispatch<React.SetStateAction<string>>;
  onAddAttribute: () => void;
  onClearSlotImage: () => void;
}) {
  return (
    <main className="studio-layout">
      <aside className={props.leftWidth <= 0 ? "left-rail panel rail-collapsed" : "left-rail panel"} style={{ width: `${props.leftWidth}px` }}>
        <div className="left-bottom-sections" ref={props.leftBottomSectionsRef}>
          <div className={props.objectSectionHeight <= 0 ? "rail-pane object-section pane-collapsed" : "rail-pane object-section"} style={{ flex: `0 0 ${props.objectSectionHeight}px` }}>
            <div className="section-heading">
              <h2>Hierarchy</h2>
            </div>
            {props.objectTree.length ? (
              <ObjectTreeView
                nodes={props.objectTree}
                activeIds={props.selectedIds}
                linkedIds={props.linkedObjectIds}
                hoveredId={props.hoveredObjectId}
                dropTarget={props.treeDropTarget}
                containerRef={props.objectHierarchyRef}
                onHover={props.onHoverTreeNode}
                onSelect={props.onSelectTreeNode}
                onRename={props.onRenameNodeLabel}
                onDragStart={props.onTreeDragStart}
                onDragEnterTarget={(id) => props.setTreeDropTarget(id)}
                onDropRoot={() => props.onTreeDropTarget(null)}
                onDropTarget={(id) => props.onTreeDropTarget(id)}
                onDragEnd={props.onTreeDragEnd}
              />
            ) : (
              <p className="empty-copy">No editable SVG objects loaded yet.</p>
            )}
          </div>

          <div className="pane-splitter horizontal" title="Drag to resize. Double-click to collapse or restore." onMouseDown={props.onStartObjectResize} onDoubleClick={props.onToggleObjectSection}>
            <div className="pane-splitter-grip" />
          </div>

          {props.rightPanelMode === "codex" ? (
            <div className="codex-bottom-sections" ref={props.codexBottomSectionsRef}>
              <AnnotationMarksPanel
                height={props.codexMarksHeight}
                annotations={props.codexAnnotations}
                selectedAnnotationId={props.selectedCodexAnnotationId}
                hoveredAnnotationId={props.hoveredCodexAnnotationId}
                linkedObjectIds={props.linkedObjectIds}
                onSelect={props.onSelectCodexAnnotation}
                onHover={props.onHoverCodexAnnotation}
                onDelete={props.onDeleteCodexAnnotation}
                onClear={props.onClearCodexAnnotations}
              />
              <div className="pane-splitter horizontal" title="Drag to resize." onMouseDown={props.onStartCodexMarksResize}>
                <div className="pane-splitter-grip" />
              </div>
              <AttachedPayloadPanel context={props.codexFigureContext} />
            </div>
          ) : (
            <AssetsPanel
              activeFigureId={props.activeFigureId}
              actionState={props.actionState}
              activeAssets={props.activeAssets}
              uploadRef={props.uploadRef}
              onOpenUpload={props.onOpenUpload}
              onUploadFiles={props.onUploadFiles}
              onRefresh={props.onRefreshAssets}
            />
          )}
        </div>
      </aside>

      <div className="pane-splitter vertical" title="Drag to resize. Double-click to collapse or restore." onMouseDown={(event) => props.onStartOuterResize("left", event)} onDoubleClick={props.onToggleLeftRail}>
        <div className="pane-splitter-grip vertical" />
      </div>

      <section className="center-pane">
        <CanvasToolbar
          mode={props.rightPanelMode === "codex" ? "codex" : "editor"}
          disabled={!props.activeSource}
          hasSelection={Boolean(props.selected)}
          hasCodexSelection={Boolean(props.selectedIds.length)}
          multiSelection={props.selectedIds.length > 1}
          canUngroup={props.selected?.kind === "group"}
          interactionMode={props.interactionMode}
          alignmentEnabled={props.alignmentEnabled}
          toolMode={props.toolMode}
          codexAnnotationTool={props.codexAnnotationTool}
          codexAnnotationColor={props.codexAnnotationColor}
          codexGalleryEnabled={Boolean(props.codexGalleryRun)}
          codexGalleryVisible={props.codexGalleryVisible}
          onToggleCodexGallery={props.onToggleCodexGallery}
          onFit={props.onFitViewport}
          onZoom100={props.onZoom100}
          onGroup={props.onGroupSelection}
          onUngroup={props.onUngroupSelection}
          onToolModeChange={props.onToolModeChange}
          onCodexAnnotationToolChange={props.onCodexAnnotationToolChange}
          onCodexAnnotationColorChange={props.onCodexAnnotationColorChange}
          onAddSelectionAnnotation={props.onAddSelectionAnnotation}
          onClearCodexAnnotations={props.onClearCodexAnnotations}
          onInteractionModeChange={props.onInteractionModeChange}
          onToggleAlignment={props.onToggleAlignment}
          onAlign={props.onAlignSelection}
        />

        {props.rightPanelMode === "codex" && props.codexGalleryRun && props.codexGalleryVisible ? (
          <CodexCanvasGallery
            run={props.codexGalleryRun}
            annotationTool={props.codexAnnotationTool}
            annotationColor={props.codexAnnotationColor}
            onClose={props.onToggleCodexGallery}
            onFocusCard={props.onFocusGalleryCard}
          />
        ) : props.activeSource ? (
          <>
            <CanvasViewport
              showHelpers={props.showHelpers}
              previewRef={props.previewRef}
              canvasViewportRef={props.canvasViewportRef}
              svgHostRef={props.svgHostRef}
              viewport={props.viewport}
              cursorPoint={props.cursorPoint}
              toolMode={props.toolMode}
              codexMode={props.rightPanelMode === "codex"}
              codexAnnotationTool={props.codexAnnotationTool}
              codexAnnotations={props.codexAnnotations}
              selectedCodexAnnotationId={props.selectedCodexAnnotationId}
              hoveredCodexAnnotationId={props.hoveredCodexAnnotationId}
              selected={props.selected}
              selectedCount={props.selectedIds.length}
              selectionBox={props.selectionBox}
              selectionOverlayRef={props.selectionOverlayRef}
              marqueeBox={props.marqueeBox}
              alignmentGuides={props.alignmentGuides}
              editingTextId={props.editingTextId}
              editingTextValue={props.editingTextValue}
              editingTextBox={props.editingTextBox}
              rulerMarks={props.rulerMarks}
              selectableSelection={Boolean(props.selected)}
              onViewportPointerDown={props.onViewportPointerDown}
              onViewportWheel={props.onViewportWheel}
              onCursorMove={props.onCursorMove}
              onCursorLeave={props.onCursorLeave}
              onSelectEditable={props.onSelectEditable}
              onBeginTextEdit={props.onBeginTextEdit}
              onEditingTextChange={props.onEditingTextChange}
              onCommitTextEdit={props.onCommitTextEdit}
              onCancelTextEdit={props.onCancelTextEdit}
              onImportAssetToSlot={props.onImportAssetToSlot}
              onCodexPointerDown={props.onCodexPointerDown}
              onCodexPointerMove={props.onCodexPointerMove}
              onCodexPointerUp={props.onCodexPointerUp}
              onStartMove={props.onStartMove}
              onStartResize={props.onStartResize}
            />

            <div className="pane-splitter horizontal" title="Drag to resize. Double-click to collapse or restore." onMouseDown={props.onStartBottomResize} onDoubleClick={props.onToggleBottomPanel}>
              <div className="pane-splitter-grip" />
            </div>

            <CaptionPanel
              bottomPanelHeight={props.bottomPanelHeight ?? DEFAULT_BOTTOM_HEIGHT}
              descriptionDraft={props.descriptionDraft}
              onChange={props.onDescriptionDraftChange}
            />
          </>
        ) : (
          <div className="empty-state panel">Create a new SVG figure from a template to start editing.</div>
        )}
      </section>

      <div className="pane-splitter vertical" title="Drag to resize. Double-click to collapse or restore." onMouseDown={(event) => props.onStartOuterResize("right", event)} onDoubleClick={props.onToggleRightRail}>
        <div className="pane-splitter-grip vertical" />
      </div>

      <aside className={props.rightWidth <= 0 ? "right-rail panel rail-collapsed" : "right-rail panel"} style={{ width: `${props.rightWidth}px` }}>
        {props.rightPanelMode === "codex" ? (
          <CodexWorkspace
            activeFigure={props.activeSource}
            figureContext={props.codexFigureContext}
            selectedCodexAnnotationId={props.selectedCodexAnnotationId}
            hoveredCodexAnnotationId={props.hoveredCodexAnnotationId}
            linkedObjectIds={props.linkedObjectIds}
            hoveredObjectId={props.hoveredObjectId}
            onHoverAnnotation={props.onHoverCodexAnnotation}
            onHoverObject={props.onHoverTreeNode}
            onStatus={props.onCodexStatus}
          />
        ) : (
          <InspectorPanel
            embedded
            selected={props.selected}
            artboardWidth={props.viewport.artboardWidth}
            artboardHeight={props.viewport.artboardHeight}
            selectedAttributes={props.selectedAttributes}
            selectedResolvedStyle={props.selectedResolvedStyle}
            selectedInspectorCapabilities={props.selectedInspectorCapabilities}
            newAttributeName={props.newAttributeName}
            newAttributeValue={props.newAttributeValue}
            onArtboardGeometryChange={props.onArtboardGeometryChange}
            onArtboardGeometryPreview={props.onArtboardGeometryPreview}
            onGeometryChange={props.onGeometryChange}
            onGeometryPreview={props.onGeometryPreview}
            onTextChange={props.onTextChange}
            onStyleNumberChange={props.onStyleNumberChange}
            onStyleNumberPreview={props.onStyleNumberPreview}
            onStyleStringPreview={props.onStyleStringPreview}
            onStyleStringChange={props.onStyleStringChange}
            onAttributeChange={props.onAttributeChange}
            onNewAttributeNameChange={props.onNewAttributeNameChange}
            onNewAttributeValueChange={props.onNewAttributeValueChange}
            onAddAttribute={props.onAddAttribute}
            onClearSlotImage={props.onClearSlotImage}
          />
        )}
      </aside>
    </main>
  );
}
