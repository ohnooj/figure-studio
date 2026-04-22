from __future__ import annotations

import json
from typing import Any

from .services.workspace import figure_entry, figure_files, workspace_figures


def workspace_summary() -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for entry in workspace_figures():
        figure_id = str(entry.get("id", "")).strip()
        if not figure_id:
            continue
        summary.append(
            {
                "figureId": figure_id,
                "figureTitle": str(entry.get("title", "")).strip(),
                "folder": str(entry.get("folder", "")).strip(),
                "entrySvg": str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg",
                "sourceFiles": figure_files(entry),
            }
        )
    return summary


def figure_target_summary(figure_id: str) -> dict[str, Any]:
    entry = figure_entry(figure_id)
    return {
        "figureId": figure_id,
        "figureTitle": str(entry.get("title", "")).strip(),
        "folder": str(entry.get("folder", "")).strip(),
        "entrySvg": str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg",
        "sourceFiles": figure_files(entry),
    }


def compose_turn_prompt(
    prompt: str,
    figure_context: dict[str, Any],
    target_figure: dict[str, Any],
    scope: str,
) -> str:
    has_figure_context = bool(
        figure_context.get("figureId")
        or figure_context.get("svg")
        or figure_context.get("selectedIds")
        or figure_context.get("selectedObjects")
        or figure_context.get("annotations")
    )
    context_payload = {
        "figureId": figure_context.get("figureId"),
        "figureTitle": figure_context.get("figureTitle"),
        "selectedIds": figure_context.get("selectedIds", []),
        "selectedObjects": figure_context.get("selectedObjects", []),
        "annotations": figure_context.get("annotations", []),
        "figureSvg": figure_context.get("svg", ""),
    }
    if not has_figure_context:
        if scope == "global":
            workspace_payload = {
                "scope": "global",
                "figures": workspace_summary(),
                "activeFigure": target_figure,
            }
            return f"{prompt.strip()}\n\nGlobal figure workspace context (JSON):\n{json.dumps(workspace_payload, indent=2)}"
        return f"{prompt.strip()}\n\nFigure target context (JSON):\n{json.dumps(target_figure, indent=2)}"
    if scope == "global":
        workspace_payload = {
            "scope": "global",
            "figures": workspace_summary(),
            "activeFigure": target_figure,
            "activeFigureContext": context_payload,
        }
        return f"{prompt.strip()}\n\nGlobal figure workspace context (JSON):\n{json.dumps(workspace_payload, indent=2)}"
    payload = {
        "targetFigure": target_figure,
        "figureContext": context_payload,
    }
    return f"{prompt.strip()}\n\nFigure editing context (JSON):\n{json.dumps(payload, indent=2)}"


def compose_variant_prompt(
    *,
    prompt: str,
    figure_context: dict[str, Any],
    target_figure: dict[str, Any],
    scope: str,
    variant_index: int,
    results_count: int,
    revision_payload: list[dict[str, Any]],
) -> str:
    distinct_instruction = (
        f"You are producing option {variant_index + 1} of {results_count}. Make it meaningfully distinct from the other options in composition, emphasis, or layout choices."
        if results_count > 1
        else "Produce one clear candidate result."
    )
    revision_text = ""
    if revision_payload:
        revision_text = f"\n\nRevision candidates (JSON):\n{json.dumps(revision_payload, indent=2)}"
    controls_contract = """

You must produce a generated control bundle alongside the SVG edit for this option.

Required staged files:
- `.codex_controls/manifest.json`
- `.codex_controls/runtime.js`

The control bundle is mandatory. If you only edit the SVG and omit the control bundle, this option will be rejected.

Control manifest requirements:
- JSON object
- Include `title`, `intentSummary`, `userGoal`, `changeTheme`, `controlSummary`, `runtimeEntry`, and `initialState`
- `runtimeEntry` must point to the runtime file, usually `runtime.js`
- `initialState` must be a JSON object
- Optionally include `changedElementHints` as an array of ids or labels

Runtime requirements:
- Export an async `mount(root, context)` function
- You may optionally export `dispose()` or `update(context)`
- Render your custom controls into `root`
- Infer why the user asked for the change and expose the most useful parameters to tune that change
- Use the provided context methods to update the variant:
  - `context.setState(nextState)`
  - `context.setPreviewSvg(nextSvg)`
  - `context.setStatus(nextStatus)`
- Treat this like a temporary tuning UI for the generated design, not a permanent figure feature
- The runtime must be self-contained and use browser APIs only
"""
    return (
        f"{distinct_instruction}\n\n"
        f"{compose_turn_prompt(prompt, figure_context, target_figure, scope)}"
        f"{controls_contract}{revision_text}"
    )
