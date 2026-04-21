from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException


ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_PATH = ROOT / "workspace.json"
FIGURES_ROOT = ROOT / "figures"
TEMPLATES_ROOT = ROOT / "templates"
EXPORTS_ROOT = ROOT / "exports"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def is_image_file(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_SUFFIXES and path.is_file()


def unique_destination(target: Path) -> Path:
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    index = 2
    while True:
        candidate = target.with_name(f"{stem}-{index}{suffix}")
        if not candidate.exists():
            return candidate
        index += 1


def read_json(path: Path) -> dict[str, object]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing file: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail=f"{path.name} must contain one JSON object")
    return payload


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def resolve_from_root(value: str) -> Path:
    raw = Path(value)
    return (ROOT / raw).resolve() if not raw.is_absolute() else raw.resolve()


def next_export_version_dir(figure_id: str) -> tuple[str, Path]:
    figure_root = EXPORTS_ROOT / figure_id
    figure_root.mkdir(parents=True, exist_ok=True)
    highest = 0
    for child in figure_root.iterdir():
        if not child.is_dir():
            continue
        name = child.name
        if not name.startswith("v"):
            continue
        try:
            highest = max(highest, int(name[1:]))
        except ValueError:
            continue
    version_number = highest + 1
    version_name = f"v{version_number:03d}"
    version_dir = figure_root / version_name
    version_dir.mkdir(parents=True, exist_ok=True)
    return version_name, version_dir


def list_asset_items(base: Path, root: Path, origin: str, bookmark: str | None = None) -> list[dict[str, str]]:
    if not base.exists():
        return []
    items: list[dict[str, str]] = []
    for path in sorted(base.rglob("*")):
        if not is_image_file(path):
            continue
        payload = {
            "name": path.name,
            "path": str(path.relative_to(root)),
            "sourcePath": str(path),
            "origin": origin,
        }
        if bookmark:
            payload["bookmark"] = bookmark
        items.append(payload)
    return items
