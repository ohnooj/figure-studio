const HOTKEY_ROWS = [
  { keys: ["Cmd/Ctrl+S"], description: "Save figure from anywhere in the app" },
  { keys: ["Cmd/Ctrl+Z"], description: "Undo figure changes when not typing; native undo in text fields" },
  { keys: ["Cmd/Ctrl+Shift+Z", "Cmd/Ctrl+Y"], description: "Redo figure changes when not typing; native redo in text fields" },
  { keys: ["Cmd/Ctrl+C"], description: "Copy selection in canvas or object hierarchy" },
  { keys: ["Cmd/Ctrl+V"], description: "Paste selection in canvas or object hierarchy" },
  { keys: ["Cmd/Ctrl+A"], description: "Select all objects in canvas or object hierarchy" },
  { keys: ["Cmd/Ctrl+G"], description: "Group selection in canvas or object hierarchy" },
  { keys: ["Cmd/Ctrl+Shift+G"], description: "Ungroup selection in canvas or object hierarchy" },
  { keys: ["Delete", "Backspace"], description: "Delete selection in canvas or object hierarchy" },
  { keys: ["Esc"], description: "Clear selection in canvas or object hierarchy" },
  { keys: ["Space+Drag"], description: "Pan canvas while focused in the canvas" },
  { keys: ["Middle Drag"], description: "Pan canvas" },
  { keys: ["Wheel"], description: "Zoom canvas" },
  { keys: ["Shift+Wheel"], description: "Pan canvas" },
  { keys: ["0"], description: "Fit canvas to view from canvas or object hierarchy" },
  { keys: ["1"], description: "Set zoom to 100% from canvas or object hierarchy" },
  { keys: ["Cmd/Ctrl++"], description: "Zoom in from canvas or object hierarchy" },
  { keys: ["Cmd/Ctrl+-"], description: "Zoom out from canvas or object hierarchy" },
  { keys: ["Shift/Ctrl+Click"], description: "Add or toggle selection" },
  { keys: ["Double Click Text"], description: "Edit text inline" },
];

export function HotkeysOverlay(props: { onClose: () => void }) {
  return (
    <div className="modal-scrim" onClick={props.onClose}>
      <div className="hotkeys-modal panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <h2>Keyboard Shortcuts</h2>
          <button onClick={props.onClose}>Close</button>
        </div>
        <div className="hotkeys-grid">
          {HOTKEY_ROWS.map((row) => (
            <div key={`${row.keys.join("|")}-${row.description}`} className="hotkeys-row">
              <div className="hotkeys-keys">
                {row.keys.map((key) => (
                  <kbd key={key} className="hotkey-key">
                    {key}
                  </kbd>
                ))}
              </div>
              <div className="hotkeys-description">{row.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
