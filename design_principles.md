# Figure Studio Design Principles

## Keep SVG Canonical

- Store figures as SVG.
- Edit SVG directly.
- Do not keep alternate legacy source formats.

## One Owner Per Responsibility

- Loading belongs in workspace hooks.
- Persistence belongs in persistence hooks.
- Gesture math belongs in gesture hooks.
- SVG mutation logic belongs in SVG modules, not UI components.

## Delete Deprecated Paths

- Remove obsolete workflow code instead of preserving compatibility shims.
- Remove dead routes, UI, and files when the feature is no longer part of the product.
- Prefer fewer code paths over fallback behavior.

## Prefer Direct Code

- Avoid wrappers that only forward arguments.
- Avoid broad exception handling around normal internal flows.
- Keep boundary validation for real I/O and user input only.

## Keep Files Small By Behavior

- Split large files by responsibility, not generic helper buckets.
- If one file owns unrelated transitions, split it.
- UI files should render and forward intents, not own editor mutation logic.
- Prefer narrow module imports over broad barrel imports when a feature only needs one seam.

## Keep Runtime State Out of Saved Files

- Selection, hover, and temporary UI state must not be serialized into `figure.svg`.
- Saved SVG should contain figure content only.
- Saved SVGs should not keep redundant editor chrome content such as a hero
  title/subtitle header when that state already lives in the surrounding UI.
- Prefer rebuilding saved figures from canonical template families over
  preserving drifted structure, autogen ids, or editor-repair residue.
