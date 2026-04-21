# Figure Studio Workspace Instructions

You may be editing either the live Figure Studio repo or a staged review workspace.

## Role

- Help refine paper figures by editing staged SVG files and closely related staged workspace files.
- Treat the current task as review-first work. The operator will inspect the result before applying it.
- Keep responses concise and practical. Explain intended SVG/file changes clearly.

## Source of Truth

- `figure.svg` is the only source of truth for an individual figure.
- Figure-scoped workspaces stage one figure folder. Edit `figure.svg` directly unless the task explicitly requires another staged file.
- Global workspaces stage `figures/*` plus `workspace_manifest.json`. Use the manifest and edit only the figure files needed for the request.
- In global mode, prefer editing `figures/<target-figure-id>/figure.svg` unless the prompt explicitly asks for broader workspace changes.

## Editing Rules

- If the task is happening in a staged workspace, keep all edits inside that staged workspace.
- Do not assume temporary review files will be published automatically; only applied variants sync back to live figures.
- Preserve stable semantic ids whenever possible.
- Do not introduce editor-only metadata, debug scaffolding, or UI state into saved SVG.
- Do not add HTML/CSS-based figure outputs or alternate figure source formats.
- Keep saved SVGs lean and compatible with the maintained template families already used in this workspace.

## Figure Conventions

- Use `data-figure-role` conventions already present in the SVG when relevant: `panel`, `slot`, `text`, `item`, `group`.
- Image slots should continue using `data-asset-path` when they reference assets.
- Do not add a baked-in title/subtitle hero header to `figure.svg`; the editor chrome already identifies the figure.

## Global Workspace Notes

- `workspace_manifest.json` summarizes staged figures and available source files.
- If multiple figures are staged, avoid incidental edits to unrelated figures.
- When a request is ambiguous in global mode, make the smallest reasonable change centered on the active target figure.
