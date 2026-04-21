from __future__ import annotations

import mimetypes
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..models import FigureMetadataPayload
from .files import IMAGE_SUFFIXES, is_image_file, list_asset_items, resolve_from_root, unique_destination
from .workspace import (
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_LIBRARY,
  assert_within_allowed_sources,
  bookmark_entries,
  figure_entry,
  figure_entry_svg,
  figure_files,
  figure_folder,
  next_figure_id,
  save_workspace,
  template_entry,
  template_svg,
  workspace,
)


def create_figure_entry(raw_id: str, raw_title: str, raw_template_id: str) -> dict[str, object]:
  figure_id = raw_id.strip() or next_figure_id()
  title = raw_title.strip() or figure_id.replace("-", " ").title()
  template_id = raw_template_id.strip() or DEFAULT_TEMPLATE_ID
  template_entry(template_id)

  folder_rel = f"figures/{figure_id}"
  folder = resolve_from_root(folder_rel)
  if folder.exists():
    raise HTTPException(status_code=409, detail=f"figure already exists: {figure_id}")

  folder.mkdir(parents=True, exist_ok=True)
  (folder / "assets").mkdir(exist_ok=True)
  (folder / "figure.svg").write_text(template_svg(template_id, title), encoding="utf-8")

  current = workspace()
  figures = current.get("figures", [])
  if not isinstance(figures, list):
    figures = []
  figures.append(
    {
      "id": figure_id,
      "title": title,
      "description": "",
      "folder": folder_rel,
      "entrySvg": "figure.svg",
      "templateId": template_id,
      "publishTargets": [
        f"published/{figure_id}.pdf",
        f"published/{figure_id}.svg",
        f"published/{figure_id}.tex",
      ],
    }
  )
  current["figures"] = figures

  recent = current.get("recentFigureIds", [])
  if not isinstance(recent, list):
    recent = []
  if figure_id not in recent:
    recent.insert(0, figure_id)
  current["recentFigureIds"] = recent
  current["version"] = max(int(current.get("version", 3) or 3), 3)
  save_workspace(current)
  return {"ok": True, "id": figure_id}


def update_figure_metadata_entry(figure_id: str, payload: FigureMetadataPayload) -> dict[str, object]:
  title = payload.title.strip()
  if not title:
    raise HTTPException(status_code=400, detail="figure title is required")

  current = workspace()
  figures = current.get("figures", [])
  if not isinstance(figures, list):
    raise HTTPException(status_code=500, detail="workspace figures must be a list")

  updated: dict[str, object] | None = None
  for item in figures:
    if isinstance(item, dict) and str(item.get("id", "")).strip() == figure_id:
      item["title"] = title
      item["description"] = payload.description.strip()
      updated = item
      break

  if updated is None:
    raise HTTPException(status_code=404, detail=f"Unknown figure: {figure_id}")

  current["figures"] = figures
  save_workspace(current)
  return {"ok": True, "figure": updated}


def get_figure_payload(figure_id: str) -> dict[str, object]:
  entry = figure_entry(figure_id)
  entry_svg = figure_entry_svg(entry)
  return {
    "figure": entry,
    "svg": entry_svg.read_text(encoding="utf-8"),
    "sourceFiles": figure_files(entry),
  }


def save_figure_source(figure_id: str, svg: str) -> dict[str, object]:
  entry = figure_entry(figure_id)
  entry_svg = figure_entry_svg(entry)
  cleaned_svg = svg.strip()
  if not cleaned_svg or "<svg" not in cleaned_svg:
    raise HTTPException(status_code=400, detail="Figure SVG cannot be empty.")
  entry_svg.write_text(f"{cleaned_svg}\n", encoding="utf-8")
  return {"ok": True, "figureId": figure_id, "sourceFiles": figure_files(entry)}


def get_figure_assets_payload(figure_id: str) -> dict[str, object]:
  entry = figure_entry(figure_id)
  folder = figure_folder(entry)
  assets_root = folder / "assets"
  bookmarks: list[dict[str, object]] = []
  for bookmark in bookmark_entries():
    bookmark_root = resolve_from_root(bookmark["path"])
    bookmarks.append(
      {
        "alias": bookmark["alias"],
        "path": bookmark["path"],
        "items": list_asset_items(bookmark_root, bookmark_root, "bookmark", bookmark["alias"]),
      }
    )
  return {
    "local": list_asset_items(assets_root, folder, "local"),
    "bookmarks": bookmarks,
  }


def import_figure_asset(figure_id: str, source_path: str) -> dict[str, object]:
  entry = figure_entry(figure_id)
  folder = figure_folder(entry)
  assets_root = folder / "assets"
  assets_root.mkdir(parents=True, exist_ok=True)

  source = Path(source_path).expanduser().resolve()
  if not source.exists() or not is_image_file(source):
    raise HTTPException(status_code=404, detail=f"Missing image asset: {source}")
  assert_within_allowed_sources(source, entry)

  if source.is_relative_to(assets_root):
    return {"ok": True, "relativePath": str(source.relative_to(folder)), "copied": False}

  destination = unique_destination(assets_root / source.name)
  shutil.copy2(source, destination)
  return {"ok": True, "relativePath": str(destination.relative_to(folder)), "copied": True}


async def upload_figure_assets(figure_id: str, files: list[UploadFile]) -> dict[str, object]:
  entry = figure_entry(figure_id)
  folder = figure_folder(entry)
  assets_root = folder / "assets"
  assets_root.mkdir(parents=True, exist_ok=True)

  imported: list[dict[str, str]] = []
  for upload in files:
    original_name = Path(upload.filename or "upload.bin").name
    if Path(original_name).suffix.lower() not in IMAGE_SUFFIXES:
      continue
    destination = unique_destination(assets_root / original_name)
    destination.write_bytes(await upload.read())
    imported.append({"name": destination.name, "relativePath": str(destination.relative_to(folder))})

  if not imported:
    raise HTTPException(status_code=400, detail="No supported image files were uploaded.")
  return {"ok": True, "imported": imported}


def figure_file_response(figure_id: str, path: str) -> FileResponse:
  entry = figure_entry(figure_id)
  folder = figure_folder(entry)
  target = (folder / path).resolve()
  if folder not in target.parents and target != folder:
    raise HTTPException(status_code=400, detail="figure file escapes figure folder")
  if not target.exists() or not target.is_file():
    raise HTTPException(status_code=404, detail=f"Missing figure file: {target}")
  media_type, _ = mimetypes.guess_type(target.name)
  return FileResponse(target, media_type=media_type)
