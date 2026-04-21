import type { CodexAnnotationTool, InteractionMode, ToolMode } from "../../shared/types/editor";
import { ColorPopover } from "../../shared/components/ColorPopover";

const TOOL_ICONS: Record<ToolMode, string> = {
  select: "↖",
  rectangle: "▭",
  "rounded-rectangle": "▢",
  ellipse: "◯",
  line: "╱",
  arrow: "➜",
  curve: "∿",
  text: "T",
  "image-slot": "▣",
};

const TOOL_LABELS: Record<ToolMode, string> = {
  select: "Select",
  rectangle: "Rectangle",
  "rounded-rectangle": "Rounded Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  curve: "Curve",
  text: "Text",
  "image-slot": "Image Slot",
};

export function CanvasToolbar(props: {
  mode: "editor" | "codex";
  disabled: boolean;
  hasSelection: boolean;
  multiSelection: boolean;
  canUngroup: boolean;
  interactionMode: InteractionMode;
  alignmentEnabled: boolean;
  toolMode: ToolMode;
  codexAnnotationTool: CodexAnnotationTool;
  codexAnnotationColor: string;
  hasCodexSelection: boolean;
  codexGalleryEnabled?: boolean;
  codexGalleryVisible?: boolean;
  onFit: () => void;
  onZoom100: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToolModeChange: (mode: ToolMode) => void;
  onCodexAnnotationToolChange: (mode: CodexAnnotationTool) => void;
  onCodexAnnotationColorChange: (value: string) => void;
  onToggleCodexGallery?: () => void;
  onAddSelectionAnnotation: () => void;
  onClearCodexAnnotations: () => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onToggleAlignment: () => void;
  onAlign: (mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "same-width" | "same-height") => void;
}) {
  const codexTools: Array<{ mode: CodexAnnotationTool; icon: string; label: string }> = [
    { mode: "select", icon: "⌖", label: "Select" },
    { mode: "highlight", icon: "▨", label: "Highlight" },
    { mode: "arrow", icon: "↗", label: "Arrow" },
    { mode: "freehand", icon: "✎", label: "Sketch" },
  ];

  return (
    <div className="canvas-toolbar panel">
      <div className="canvas-toolbar-main">
        <div className="toolbar-secondary">
          <button className="toolbar-mini-button" disabled={props.disabled} onClick={props.onFit}>
            Fit
          </button>
          <button className="toolbar-mini-button" disabled={props.disabled} onClick={props.onZoom100}>
            100%
          </button>
          {props.mode === "codex" ? (
            <div className="codex-toolbar-row" role="group" aria-label="Codex annotation tools">
              <div className="segmented-control segmented-control-compact codex-tool-switcher" role="group" aria-label="Codex annotation tools">
                {codexTools.map((tool) => (
                  <button
                    key={tool.mode}
                    className={props.codexAnnotationTool === tool.mode ? "segment active codex-tool-segment" : "segment codex-tool-segment"}
                    disabled={props.disabled}
                    onClick={() => props.onCodexAnnotationToolChange(tool.mode)}
                  >
                    <span className="codex-tool-icon" aria-hidden="true">{tool.icon}</span>
                    <span>{tool.label}</span>
                  </button>
                ))}
              </div>
              <div className="codex-color-field">
                <ColorPopover
                  value={props.codexAnnotationColor}
                  ariaLabel="Codex annotation color"
                  disabled={props.disabled}
                  onPreview={props.onCodexAnnotationColorChange}
                  onCommit={props.onCodexAnnotationColorChange}
                />
              </div>
              <button className="toolbar-mini-button" disabled={props.disabled || !props.hasCodexSelection} onClick={props.onAddSelectionAnnotation}>
                Add Selection
              </button>
              <button className="toolbar-mini-button" disabled={props.disabled} onClick={props.onClearCodexAnnotations}>
                Clear Marks
              </button>
              <button
                className={props.codexGalleryVisible ? "toolbar-mini-button active codex-gallery-toggle" : "toolbar-mini-button codex-gallery-toggle"}
                disabled={props.disabled || !props.codexGalleryEnabled}
                onClick={props.onToggleCodexGallery}
                title="Toggle review gallery"
                aria-label="Toggle review gallery"
              >
                <span aria-hidden="true">▥</span>
              </button>
            </div>
          ) : (
            <>
              <div className="segmented-control segmented-control-compact canvas-tool-icons" role="group" aria-label="Tool mode">
                {([
                  "select",
                  "rectangle",
                  "rounded-rectangle",
                  "ellipse",
                  "line",
                  "arrow",
                  "curve",
                  "text",
                  "image-slot",
                ] as ToolMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={props.toolMode === mode ? "segment active" : "segment"}
                    disabled={props.disabled}
                    onClick={() => props.onToolModeChange(mode)}
                    title={TOOL_LABELS[mode]}
                    aria-label={TOOL_LABELS[mode]}
                  >
                    <span aria-hidden="true">{TOOL_ICONS[mode]}</span>
                  </button>
                ))}
              </div>
              <div className="segmented-control segmented-control-compact" role="group" aria-label="Interaction mode">
                {(["resize", "scale"] as InteractionMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={props.interactionMode === mode ? "segment active toolbar-mini-button" : "segment toolbar-mini-button"}
                    disabled={props.disabled}
                    onClick={() => props.onInteractionModeChange(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                className={props.alignmentEnabled ? "toolbar-mini-button active" : "toolbar-mini-button"}
                disabled={props.disabled}
                onClick={props.onToggleAlignment}
                aria-pressed={props.alignmentEnabled}
                title={props.alignmentEnabled ? "Disable alignment snap and guides" : "Enable alignment snap and guides"}
              >
                {props.alignmentEnabled ? "Snap On" : "Snap Off"}
              </button>
              <button className="toolbar-mini-button" disabled={props.disabled || !props.hasSelection} onClick={props.onGroup}>
                Group
              </button>
              <button className="toolbar-mini-button" disabled={props.disabled || !props.canUngroup} onClick={props.onUngroup}>
                Ungroup
              </button>
              <div className="toolbar-secondary toolbar-align-icons">
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Align Left" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("left")}>L</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Align Center X" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("center-x")}>CX</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Align Right" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("right")}>R</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Align Top" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("top")}>T</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Align Center Y" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("center-y")}>CY</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Align Bottom" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("bottom")}>B</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Match Width" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("same-width")}>W</button>
                <button className="toolbar-icon-button toolbar-icon-button-small" title="Match Height" disabled={props.disabled || !props.multiSelection} onClick={() => props.onAlign("same-height")}>H</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
