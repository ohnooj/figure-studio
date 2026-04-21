# Figure Studio Architecture

## Source of Truth

- Each figure lives at `figures/<id>/figure.svg`.
- The frontend edits SVG directly.
- The backend reads and writes SVG, assets, workspace metadata, and exports.
- Saved figures are expected to match one of the maintained template families
  under `templates/`, then carry figure-specific text, slots, and items only.

## Frontend Ownership

- `app/src/App.tsx`
  top-level composition and layout wiring only, including inspector vs assistant right-rail mode
- `app/src/app/hooks/useDebugLog.ts`
  frontend debug log transport with immediate console emission and buffered backend uploads for high-frequency traces
- `app/src/shared/lib/trace.ts`
  shared operation timing helper used to stamp editor operations with ids, phases, timestamps, and durations
- `app/src/app/hooks/useFigureCanvasLifecycle.ts`
  figure mount, fit, description reset, and viewport-driven selection refresh
- `app/src/app/hooks/useStudioPanels.ts`
  default panel sizing and rail collapse/restore behavior
- `app/src/app/hooks/useWorkspaceStudio.ts`
  workspace, figure, template, and asset loading
- `app/src/app/hooks/useCodexAnnotations.ts`
  shared assistant overlay annotation state and figure-context payload derivation
- `app/src/features/codex/CodexWorkspace.tsx`
  figure-aware assistant workspace shell in the shared right rail
- `app/src/features/codex/useCodexWorkspace.ts`
  assistant session state, run lifecycle, slash-command handling, and transcript streaming
- `app/src/features/codex/codexContext.ts`
  figure-context packaging and annotation color selection
- `app/src/features/codex/codexFormatting.tsx`
  transcript markdown formatting and Codex run display helpers
- `app/src/features/codex/copy.ts`
  assistant-only clipboard copy helper
- `app/src/features/codex/AnnotationMarksPanel.tsx`
  left-rail annotation list for assistant-specific overlay marks
- `app/src/features/codex/AttachedPayloadPanel.tsx`
  left-rail payload summary for the current assistant attachment context
- `app/src/app/hooks/useFigurePersistence.ts`
  save, export, publish, and upload flows
- `app/src/app/hooks/useEditorSelection.ts`
  mounted SVG, selection state, object tree, selected raw attributes, and resolved inspector styles
- `app/src/app/hooks/useHistoryActions.ts`
  snapshot creation and undo/redo restore flow
- `app/src/app/hooks/useEditorClipboard.ts`
  copy, paste, and select-all behavior
- `app/src/app/hooks/useHierarchyActions.ts`
  delete, group, ungroup, rename, and tree reparenting
- `app/src/app/hooks/useInspectorActions.ts`
  geometry, artboard, text, style, and attribute mutations
- `app/src/app/hooks/useCanvasInteractions.ts`
  canvas selection, marquee, primitive creation, and direct-manipulation gestures, including imperative selection-overlay sync during active move/resize preview
- `app/src/app/hooks/usePaneResizers.ts`
  sidebar and bottom-panel splitters
- `app/src/shared/lib/svg/`
  SVG helpers split by responsibility:
  - `transform.ts`: local/world matrix math
  - `selection.ts`: selection models and bounds
  - `mutations.ts`: direct SVG mutations
  - `primitives.ts`: primitive creation and update
  - `alignment.ts`: snapping and guide math
  - `document.ts`, `selectability.ts`, `serialize.ts`, `shared.ts`, `tree.ts`: focused helpers

## Backend Ownership

- `backend/app.py`
  FastAPI wiring only
- `backend/runtime.py`
  shared backend runtime state for watcher, assistant store, and brokers
- `backend/routes/workspace.py`
  health, workspace, templates, and SSE event routes
- `backend/routes/figures.py`
  figure CRUD, assets, uploads, and figure-file routes
- `backend/routes/exports.py`
  export and publish routes
- `backend/routes/codex.py`
  assistant thread/run REST and SSE endpoints
- `backend/routes/logs.py`
  debug log ingestion and formatting for single events and buffered event batches
- `backend/codex_store.py`
  durable assistant thread/run/event persistence
- `backend/codex_bridge.py`
  local Codex App Server bridge, staging workspace flow, and run event normalization
- `backend/models.py`
  request payload models
- `backend/events.py`
  watcher and SSE streaming
- `backend/services/files.py`
  filesystem helpers and asset listing
- `backend/services/figures.py`
  figure creation, metadata updates, assets, uploads, and file resolution
- `backend/services/exports.py`
  export bundle and publish flows
- `backend/services/workspace.py`
  workspace, figure, bookmark, and template helpers

## Runtime Boundaries

- Pan and zoom are viewport camera state only.
- Figure geometry belongs to the SVG document.
- Export and publish operate on saved SVG plus configured `publishTargets`.
- Editor-only selection and UI state are transient and must not be serialized into `figure.svg`.
- Saved figures should not include a baked-in title/subtitle hero scaffold; the
  figure tab bar is the figure identifier in the editor chrome.
- Stable semantic ids belong in saved SVGs. Auto-generated repair ids and
  serialized editor-frame metadata are migration debt and should be removed
  rather than preserved.
- Codex-backed figure edits run in a staged workspace first. Chats keep scope (`figure` or `global`), while the active editor tab supplies the target figure per run. Figure-scoped runs stage that figure folder; `/global` runs stage `figures/*` plus a workspace manifest.
- Each staged workspace also includes a local `AGENTS.md` so automated edits can follow the same SVG and workspace rules.
- Each prompt produces a review set with one to three isolated variants. Apply/reject happens per variant, but applying one variant locks the whole review set and removes the remaining review actions for that message.
- Enlarged review opens in the center canvas area as a before/options gallery. Marked variants plus current overlay annotations become inputs to the next revision round, while those annotations remain editor-only state and are not written into figure assets.
- Apply writes the staged figure or global workspace file changes back to the live figure tree only after explicit user confirmation.
- Chat context is figure-aware and may attach the current SVG, selected object summaries, and transient overlay annotations; those marks render as editor-only overlays and are not written into figure assets.
