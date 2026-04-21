from __future__ import annotations

import shutil
import subprocess

from fastapi import HTTPException

from .files import ROOT, next_export_version_dir, resolve_from_root


def build_pdf_export(svg_path, pdf_path):
  inkscape = shutil.which("inkscape")
  if inkscape is None:
    return {
      "ok": False,
      "error": "inkscape_not_found",
      "message": "Inkscape is not installed or not on PATH.",
      "svgPath": str(svg_path.relative_to(ROOT)),
      "pdfPath": str(pdf_path.relative_to(ROOT)),
    }
  try:
    subprocess.run(
      [inkscape, str(svg_path), "--export-type=pdf", f"--export-filename={pdf_path}"],
      check=True,
      capture_output=True,
      text=True,
    )
  except subprocess.CalledProcessError as exc:
    raise HTTPException(status_code=500, detail=exc.stderr or exc.stdout or "Inkscape export failed")
  return {"ok": True, "svgPath": str(svg_path.relative_to(ROOT)), "pdfPath": str(pdf_path.relative_to(ROOT))}


def export_bundle(figure_id: str, svg: str, text: str | None = None) -> dict[str, object]:
  cleaned_figure_id = figure_id.strip()
  if not cleaned_figure_id:
    raise HTTPException(status_code=400, detail="figureId is required")

  version_name, version_dir = next_export_version_dir(cleaned_figure_id)
  svg_path = version_dir / f"{cleaned_figure_id}.svg"
  pdf_path = version_dir / f"{cleaned_figure_id}.pdf"
  text_path = version_dir / f"{cleaned_figure_id}.tex"

  svg_path.write_text(svg, encoding="utf-8")
  if text is not None:
    text_path.write_text(text.rstrip() + "\n", encoding="utf-8")

  pdf_payload = build_pdf_export(svg_path, pdf_path)

  response: dict[str, object] = {
    "ok": True,
    "figureId": cleaned_figure_id,
    "version": version_name,
    "directory": str(version_dir.relative_to(ROOT)),
    "svgPath": str(svg_path.relative_to(ROOT)),
    "pdfPath": str(pdf_path.relative_to(ROOT)),
    "pdf": pdf_payload,
  }
  if text is not None:
    response["textPath"] = str(text_path.relative_to(ROOT))
  return response


def publish_exports(figure_id: str, sources: list[str], targets: list[str]) -> dict[str, object]:
  copied: list[dict[str, str]] = []
  for source, target in zip(sources, targets, strict=False):
    src = resolve_from_root(source)
    dst = resolve_from_root(target)
    if not src.exists():
      raise HTTPException(status_code=404, detail=f"Missing source export: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    copied.append({"source": str(src.relative_to(ROOT)), "target": str(dst)})
  return {"ok": True, "figureId": figure_id, "copied": copied}
