from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException

from .files import ROOT, TEMPLATES_ROOT, WORKSPACE_PATH, read_json, resolve_from_root, write_json


TEMPLATE_LIBRARY = [
    {
        "id": "blank",
        "title": "Blank SVG",
        "description": "One empty artboard with no default title scaffold or preset panels.",
        "file": "blank.svg",
    },
    {
        "id": "compare-2col",
        "title": "2-Column Compare",
        "description": "Two large side-by-side panels for before/after or workflow comparison.",
        "file": "compare-2col.svg",
    },
    {
        "id": "pipeline-3stage",
        "title": "3-Stage Pipeline",
        "description": "Three horizontal panels with arrows between stages.",
        "file": "pipeline-3stage.svg",
    },
    {
        "id": "scenario-3panel",
        "title": "3-Panel Scenario",
        "description": "Three equally weighted panels for scenario walkthroughs.",
        "file": "scenario-3panel.svg",
    },
    {
        "id": "teaser-4panel",
        "title": "4-Panel Teaser",
        "description": "Four-panel narrative sequence with directional arrows.",
        "file": "teaser-4panel.svg",
    },
    {
        "id": "gallery-4tile",
        "title": "4-Tile Gallery",
        "description": "Four equal tiles arranged as a compact gallery.",
        "file": "gallery-4tile.svg",
    },
    {
        "id": "detail-5panel",
        "title": "5-Panel Detail",
        "description": "Five narrow panels for step-by-step method details.",
        "file": "detail-5panel.svg",
    },
    {
        "id": "design-principles",
        "title": "Design Principles",
        "description": "Three conceptual panels for principles or claims.",
        "file": "design-principles.svg",
    },
    {
        "id": "terminology",
        "title": "Terminology / Legend",
        "description": "Legend-style layout for notation and concept mapping.",
        "file": "terminology.svg",
    },
]
DEFAULT_TEMPLATE_ID = "blank"


def workspace() -> dict[str, object]:
    return read_json(WORKSPACE_PATH)


def save_workspace(payload: dict[str, object]) -> None:
    write_json(WORKSPACE_PATH, payload)


def workspace_figures() -> list[dict[str, object]]:
    figures = workspace().get("figures", [])
    if not isinstance(figures, list):
        raise HTTPException(status_code=500, detail="workspace figures must be a list")
    return [item for item in figures if isinstance(item, dict)]


def figure_entry(figure_id: str) -> dict[str, object]:
    for item in workspace_figures():
        if str(item.get("id", "")).strip() == figure_id:
            return item
    raise HTTPException(status_code=404, detail=f"Unknown figure: {figure_id}")


def figure_folder(entry: dict[str, object]) -> Path:
    folder = str(entry.get("folder", "")).strip()
    if not folder:
        raise HTTPException(status_code=500, detail="figure entry missing folder")
    resolved = resolve_from_root(folder)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail=f"Missing figure folder: {resolved}")
    return resolved


def figure_entry_svg(entry: dict[str, object]) -> Path:
    folder = figure_folder(entry)
    entry_svg = str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg"
    path = (folder / entry_svg).resolve()
    if folder not in path.parents and path != folder:
        raise HTTPException(status_code=400, detail="entrySvg escapes figure folder")
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing figure SVG: {path}")
    return path


def figure_files(entry: dict[str, object]) -> list[str]:
    folder = figure_folder(entry)
    return [str(path.relative_to(ROOT)) for path in sorted(folder.rglob("*")) if path.is_file()]


def next_figure_id() -> str:
    existing_ids = {str(item.get("id", "")).strip() for item in workspace_figures()}
    index = 1
    while True:
        candidate = f"figure-{index:03d}"
        if candidate not in existing_ids:
            return candidate
        index += 1


def template_entry(template_id: str) -> dict[str, str]:
    for item in TEMPLATE_LIBRARY:
        if item["id"] == template_id:
            return item
    raise HTTPException(status_code=404, detail=f"Unknown template: {template_id}")


def template_svg(template_id: str, title: str) -> str:
    template = template_entry(template_id)
    path = TEMPLATES_ROOT / template["file"]
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing template SVG: {path}")
    return path.read_text(encoding="utf-8").replace("{{TITLE}}", title)


def bookmark_entries() -> list[dict[str, str]]:
    bookmarks = workspace().get("bookmarks", [])
    if not isinstance(bookmarks, list):
        return []
    result: list[dict[str, str]] = []
    for item in bookmarks:
        if not isinstance(item, dict):
            continue
        alias = str(item.get("alias", "")).strip()
        path = str(item.get("path", "")).strip()
        if alias and path:
            result.append({"alias": alias, "path": path})
    return result


def allowed_asset_sources(entry: dict[str, object]) -> list[Path]:
    folder = figure_folder(entry)
    roots = [folder, folder / "assets"]
    for bookmark in bookmark_entries():
        roots.append(resolve_from_root(bookmark["path"]))
    return roots


def assert_within_allowed_sources(path: Path, entry: dict[str, object]) -> None:
    for root in allowed_asset_sources(entry):
        if path.is_relative_to(root):
            return
    raise HTTPException(status_code=400, detail=f"Asset source is outside allowed roots: {path}")
