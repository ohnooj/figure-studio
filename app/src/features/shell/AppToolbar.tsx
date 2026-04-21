import { useEffect, useRef, useState } from "react";

import type {
  ActionState,
  BackendState,
  FigureEntry,
  FigureSource,
  ThemePreference,
} from "../../shared/types/editor";
import { FigureTabs } from "./FigureTabs";

export function AppToolbar(props: {
  activeSource: FigureSource | null;
  actionState: ActionState;
  backendState: BackendState;
  status: string;
  hasUnsavedChanges: boolean;
  rightPanelMode: "inspector" | "codex";
  themePreference: ThemePreference;
  showHelpers: boolean;
  debugLogging: boolean;
  figures: FigureEntry[];
  activeFigureId: string;
  renamingFigureId: string;
  renameDraft: string;
  figuresDisabled: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onPublish: () => void;
  onThemeChange: (theme: ThemePreference) => void;
  onToggleHelpers: () => void;
  onToggleDebugLogging: () => void;
  onOpenHotkeys: () => void;
  onOpenNotifications: () => void;
  onRightPanelModeChange: (mode: "inspector" | "codex") => void;
  onSelectFigure: (figureId: string) => void;
  onBeginRenameFigure: (figure: FigureEntry) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRenameFigure: (figureId: string) => void;
  onCancelRenameFigure: () => void;
  onCreateFigure: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!(event.target instanceof Node) || !settingsRef.current?.contains(event.target)) {
        setSettingsOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div className="app-toolbar panel">
      <div className="app-toolbar-main">
        <div className="toolbar-title-block">
          <span className="toolbar-app-title">Figure Studio</span>
        </div>

        <div className="toolbar-primary">
          <FigureTabs
            figures={props.figures}
            activeFigureId={props.activeFigureId}
            renamingFigureId={props.renamingFigureId}
            renameDraft={props.renameDraft}
            disabled={props.figuresDisabled}
            onSelect={props.onSelectFigure}
            onBeginRename={props.onBeginRenameFigure}
            onRenameDraftChange={props.onRenameDraftChange}
            onCommitRename={props.onCommitRenameFigure}
            onCancelRename={props.onCancelRenameFigure}
            onCreate={props.onCreateFigure}
          />
        </div>

        <div className="toolbar-status-group">
          <span className={`status status-${props.backendState}`}>
            {props.backendState === "ready"
              ? `${props.actionState}: ${props.status}${props.hasUnsavedChanges ? " • unsaved changes" : ""}`
              : props.status}
          </span>
          <div className="segmented-control segmented-control-compact" role="group" aria-label="Right panel mode">
            <button className={props.rightPanelMode === "inspector" ? "segment active" : "segment"} onClick={() => props.onRightPanelModeChange("inspector")}>
              Inspector
            </button>
            <button className={props.rightPanelMode === "codex" ? "segment active" : "segment"} onClick={() => props.onRightPanelModeChange("codex")}>
              Codex
            </button>
          </div>
        </div>

        <div className="toolbar-secondary toolbar-secondary-right">
          <div className="toolbar-icon-actions" aria-label="Document actions">
            <button className="icon-button" title="Save" aria-label="Save" disabled={!props.activeSource || props.actionState !== "idle"} onClick={props.onSave}>
              <span aria-hidden="true">💾</span>
            </button>
            <button className="icon-button" title="Undo" aria-label="Undo" disabled={!props.activeSource} onClick={props.onUndo}>
              <span aria-hidden="true">↶</span>
            </button>
            <button className="icon-button" title="Redo" aria-label="Redo" disabled={!props.activeSource} onClick={props.onRedo}>
              <span aria-hidden="true">↷</span>
            </button>
            <button className="icon-button" title="Export" aria-label="Export" disabled={!props.activeSource || props.actionState !== "idle"} onClick={props.onExport}>
              <span aria-hidden="true">⇪</span>
            </button>
            <button className="icon-button" title="Publish" aria-label="Publish" disabled={!props.activeSource || props.actionState !== "idle"} onClick={props.onPublish}>
              <span aria-hidden="true">⤴</span>
            </button>
          </div>
          <div className="settings-menu" ref={settingsRef}>
            <button
              className="settings-trigger"
              aria-label="Open settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              ☰
            </button>
            {settingsOpen ? (
              <div className="settings-dropdown panel">
                <div className="settings-section">
                  <span className="settings-label">Theme</span>
                  <div className="segmented-control segmented-control-compact" role="group" aria-label="Theme">
                    {(["light", "dark", "system"] as ThemePreference[]).map((theme) => (
                      <button
                        key={theme}
                        className={props.themePreference === theme ? "segment active" : "segment"}
                        onClick={() => props.onThemeChange(theme)}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-section">
                  <button className={props.showHelpers ? "helper-toggle active" : "helper-toggle"} onClick={props.onToggleHelpers}>
                    {props.showHelpers ? "Helpers On" : "Helpers Off"}
                  </button>
                </div>
                <div className="settings-section">
                  <button
                    className="helper-toggle"
                    onClick={() => {
                      setSettingsOpen(false);
                      props.onOpenNotifications();
                    }}
                  >
                    Error Notifications
                  </button>
                </div>
                <div className="settings-section">
                  <button className="helper-toggle" onClick={props.onOpenHotkeys}>
                    Hotkeys
                  </button>
                </div>
                <div className="settings-section">
                  <button className={props.debugLogging ? "helper-toggle active" : "helper-toggle"} onClick={props.onToggleDebugLogging}>
                    {props.debugLogging ? "Debug Logging On" : "Debug Logging Off"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
