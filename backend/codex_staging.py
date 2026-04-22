from __future__ import annotations

import base64
import json
import re
import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .services.files import FIGURES_ROOT, ROOT, WORKSPACE_PATH, resolve_from_root
from .services.workspace import figure_entry, figure_entry_svg, workspace_figures


def stage_annotated_image(variant_staging_dir: Path, annotated_image_url: str) -> Path | None:
    value = annotated_image_url.strip()
    if not value:
        return None
    data_url_match = re.match(r"^data:(?P<mime>[^;,]+);base64,(?P<data>.+)$", value, re.DOTALL)
    if not data_url_match:
        return None
    mime_type = str(data_url_match.group("mime") or "").strip().lower()
    encoded = str(data_url_match.group("data") or "").strip()
    if not mime_type or not encoded:
        return None
    extension = {
        "image/svg+xml": "svg",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
    }.get(mime_type)
    if not extension:
        return None
    try:
        payload = base64.b64decode(encoded, validate=True)
    except Exception:
        return None
    image_path = variant_staging_dir / f"codex_attachment.{extension}"
    image_path.write_bytes(payload)
    return image_path


def write_staging_agents_file(staging_dir: Path) -> None:
    source = ROOT / "AGENTS.md"
    if not source.exists():
        return
    (staging_dir / "AGENTS.md").write_text(source.read_text(encoding="utf-8"), encoding="utf-8")


def build_single_figure_staging_dir(staging_dir: Path, figure_id: str) -> None:
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)
    write_staging_agents_file(staging_dir)
    entry = figure_entry(figure_id)
    source_dir = Path(resolve_from_root(str(entry["folder"])))
    shutil.copytree(source_dir, staging_dir, dirs_exist_ok=True)


def build_global_staging_dir(staging_dir: Path) -> None:
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)
    write_staging_agents_file(staging_dir)
    figures_dir = staging_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    for entry in workspace_figures():
        figure_id = str(entry.get("id", "")).strip()
        if not figure_id:
            continue
        source_dir = Path(resolve_from_root(str(entry["folder"])))
        destination_dir = figures_dir / figure_id
        shutil.copytree(source_dir, destination_dir, dirs_exist_ok=True)
        manifest.append(
            {
                "id": figure_id,
                "title": str(entry.get("title", "")).strip(),
                "folder": f"figures/{figure_id}",
                "entrySvg": str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg",
                "sourceFiles": [
                    str(path.relative_to(staging_dir))
                    for path in sorted(destination_dir.rglob("*"))
                    if path.is_file()
                ],
            }
        )
    workspace_snapshot = WORKSPACE_PATH.read_text(encoding="utf-8") if WORKSPACE_PATH.exists() else "{}\n"
    (staging_dir / "workspace.json").write_text(workspace_snapshot, encoding="utf-8")
    (staging_dir / "workspace_manifest.json").write_text(
        json.dumps({"scope": "global", "figureCount": len(manifest), "figures": manifest}, indent=2) + "\n",
        encoding="utf-8",
    )


def build_staging_dir(staging_dir: Path, figure_id: str, scope: str) -> None:
    if scope == "global":
        build_global_staging_dir(staging_dir)
        return
    build_single_figure_staging_dir(staging_dir, figure_id)


def read_staging_svg(staging_dir: Path, scope: str, target_figure_id: str = "") -> str | None:
    if scope == "global":
        if not target_figure_id:
            return None
        svg_path = staging_dir / "figures" / target_figure_id / "figure.svg"
    else:
        svg_path = staging_dir / "figure.svg"
    if not svg_path.exists():
        return None
    return svg_path.read_text(encoding="utf-8")


def sync_global_staging_dir(staging_dir: Path) -> None:
    staged_figures_root = staging_dir / "figures"
    if not staged_figures_root.exists():
        raise HTTPException(status_code=404, detail="Staged global figures directory is missing.")
    for staged_path in sorted(staged_figures_root.rglob("*")):
        if not staged_path.is_file():
            continue
        relative_path = staged_path.relative_to(staged_figures_root)
        live_path = FIGURES_ROOT / relative_path
        live_path.parent.mkdir(parents=True, exist_ok=True)
        if live_path.exists() and live_path.read_bytes() == staged_path.read_bytes():
            continue
        shutil.copy2(staged_path, live_path)


def sync_single_figure_variant(staging_dir: Path, target_figure_id: str) -> None:
    entry = figure_entry(target_figure_id)
    live_svg_path = figure_entry_svg(entry)
    staged_svg_path = staging_dir / "figure.svg"
    if not staged_svg_path.exists():
        raise HTTPException(status_code=404, detail="Staged figure.svg is missing.")
    live_svg_path.write_text(staged_svg_path.read_text(encoding="utf-8"), encoding="utf-8")


def write_variant_preview_svg(staging_dir: Path, scope: str, target_figure_id: str, svg: str) -> None:
    if scope == "global":
        if not target_figure_id:
            raise HTTPException(status_code=422, detail="Interactive preview requires a target figure.")
        svg_path = staging_dir / "figures" / target_figure_id / "figure.svg"
    else:
        svg_path = staging_dir / "figure.svg"
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path.write_text(svg, encoding="utf-8")
