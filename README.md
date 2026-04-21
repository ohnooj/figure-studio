# Figure Studio

Figure Studio is an SVG-first editor for paper figures.

## Run

Backend:

```bash
python3 -m uvicorn backend.app:app --reload --port 8123
```

Frontend:

```bash
cd app
npm run dev
```

Optional frontend API override:

```bash
cd app
VITE_API_ROOT=http://127.0.0.1:8123 npm run dev
```

## Layout

- `app/`
  React editor UI
- `backend/`
  FastAPI routes plus workspace/file/event services
- `figures/<figure-id>/figure.svg`
  canonical figure source
- `figures/<figure-id>/assets/`
  figure-local raster assets
- `templates/`
  SVG starter templates
- `exports/`
  generated SVG, PDF, and LaTeX caption outputs, versioned under `exports/<figure-id>/v###/`
- `workspace.json`
  figure registry, export targets, publish targets, and bookmarks

## Workflow

1. Create a figure from a template.
2. Edit the SVG in the canvas, hierarchy, and inspector.
3. Save to write `figure.svg`.
4. Export to generate a new versioned bundle in `exports/<figure-id>/v###/`.
5. Publish to copy the latest exported bundle to configured destinations.

Color controls in the toolbar and inspector use in-browser HSV popovers with a wheel plus value slider instead of the host OS color picker.

## Codex Chat

- Codex sessions are review-first and operate on staged workspace copies before any live files are updated.
- Figure-scoped chats target the active figure. `/global` stages the whole `figures/` workspace plus a workspace manifest for multi-figure edits.
- Prompts can request multiple result variants. Each variant stays pending until you explicitly apply or reject it.
- Applying a figure-scoped result writes the chosen staged change back to the live figure file. Applying a global result writes the chosen staged file set back to the live workspace.
- The backend stores local Codex run state under `.codex_chat/`. That directory is runtime data and should stay untracked.

## SVG Conventions

Each figure folder should look like:

```text
figures/<figure-id>/
  figure.svg
  assets/
```

Editable SVG nodes should have stable ids. Use `data-figure-role` where appropriate:

- `panel`
- `slot`
- `text`
- `item`
- `group`

Image slots store their asset path with `data-asset-path`.

Saved figures should be rebuilt from one of the maintained template families:

- `compare-2col.svg`
- `design-principles.svg`
- `detail-5panel.svg`
- `gallery-4tile.svg`
- `pipeline-3stage.svg`
- `scenario-3panel.svg`
- `teaser-4panel.svg`
- `terminology.svg`

Do not save a separate figure title/subtitle hero header inside `figure.svg`; the editor tab bar identifies the active figure.

## Notes

- `figure.svg` is the only supported source of truth.
- The old HTML/CSS figure workflow has been removed.
- Editor-only state does not belong in saved figure files.
- Saved SVGs should stay lean: no autogen `auto-*` ids and no serialized editor-frame metadata.
- `workspace.json` should contain only repo-safe figure metadata and publish/bookmark paths that you intend to share.
