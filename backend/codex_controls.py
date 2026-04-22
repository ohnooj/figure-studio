from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, cast

from fastapi import HTTPException


def normalize_control_runtime_path(staging_dir: Path, relative_path: str) -> tuple[str, Path]:
    normalized = relative_path.strip().replace("\\", "/").lstrip("/")
    candidate = (staging_dir / normalized).resolve()
    try:
        candidate.relative_to(staging_dir.resolve())
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail="Codex control runtime path escapes the staged workspace.",
        ) from error
    if not candidate.is_file():
        raise HTTPException(
            status_code=422,
            detail=f"Codex control runtime entry is missing: {normalized}",
        )
    return normalized, candidate


def read_control_bundle(variant_staging_dir: Path) -> dict[str, Any]:
    controls_root = variant_staging_dir / ".codex_controls"
    manifest_path = controls_root / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(
            status_code=422,
            detail="Codex did not create .codex_controls/manifest.json.",
        )
    try:
        manifest = cast(object, json.loads(manifest_path.read_text(encoding="utf-8")))
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=422, detail="Codex control manifest is not valid JSON.") from error
    if not isinstance(manifest, dict):
        raise HTTPException(status_code=422, detail="Codex control manifest must be a JSON object.")
    manifest = cast(dict[str, object], manifest)
    runtime_entry = str(manifest.get("runtimeEntry") or "runtime.js").strip()
    if not runtime_entry:
        raise HTTPException(status_code=422, detail="Codex control manifest is missing runtimeEntry.")
    runtime_relative = (
        runtime_entry
        if runtime_entry.startswith(".codex_controls/")
        else f".codex_controls/{runtime_entry.lstrip('./')}"
    )
    runtime_path, _ = normalize_control_runtime_path(variant_staging_dir, runtime_relative)
    initial_state = manifest.get("initialState")
    if initial_state is None:
        manifest["initialState"] = {}
    elif not isinstance(initial_state, dict):
        raise HTTPException(status_code=422, detail="Codex control manifest initialState must be a JSON object.")
    manifest.setdefault("id", "codex-generated-controls")
    manifest.setdefault("title", "Generated Controls")
    manifest.setdefault("intentSummary", "")
    manifest.setdefault("userGoal", "")
    manifest.setdefault("changeTheme", "")
    manifest.setdefault("controlSummary", "")
    changed_hints = manifest.get("changedElementHints")
    if changed_hints is None:
        manifest["changedElementHints"] = []
    elif not isinstance(changed_hints, list):
        raise HTTPException(status_code=422, detail="Codex control manifest changedElementHints must be a JSON array.")
    return {
        "manifest": manifest,
        "runtimePath": runtime_path,
    }


def sanitize_svg(svg: str) -> str:
    value = svg.strip()
    if "<svg" not in value:
        raise HTTPException(status_code=422, detail="Interactive preview must be a complete SVG document.")
    try:
        root = ET.fromstring(value)
    except ET.ParseError as error:
        raise HTTPException(status_code=422, detail="Interactive preview SVG is not valid XML.") from error
    if not root.tag.lower().endswith("svg"):
        raise HTTPException(status_code=422, detail="Interactive preview root must be an <svg> element.")
    for parent in list(root.iter()):
        for child in list(parent):
            child_tag = str(child.tag).lower()
            if child_tag.endswith("script") or child_tag.endswith("foreignobject"):
                parent.remove(child)
                continue
            for attribute in list(child.attrib):
                lowered = attribute.lower()
                if lowered.startswith("on"):
                    child.attrib.pop(attribute, None)
                    continue
                if lowered in {"href", "xlink:href"}:
                    target = str(child.attrib.get(attribute, "")).strip().lower()
                    if target.startswith("javascript:"):
                        child.attrib.pop(attribute, None)
        for attribute in list(parent.attrib):
            lowered = attribute.lower()
            if lowered.startswith("on"):
                parent.attrib.pop(attribute, None)
                continue
            if lowered in {"href", "xlink:href"}:
                target = str(parent.attrib.get(attribute, "")).strip().lower()
                if target.startswith("javascript:"):
                    parent.attrib.pop(attribute, None)
    return ET.tostring(root, encoding="unicode")
