from pathlib import Path

import pytest
from backend.codex_controls import normalize_control_runtime_path, read_control_bundle, sanitize_svg
from fastapi import HTTPException


def test_read_control_bundle_returns_manifest_and_runtime_path(tmp_path: Path) -> None:
    controls_dir = tmp_path / ".codex_controls"
    controls_dir.mkdir()
    (controls_dir / "manifest.json").write_text(
        '{"title":"Controls","runtimeEntry":"runtime.js","initialState":{"strength":2}}',
        encoding="utf-8",
    )
    (controls_dir / "runtime.js").write_text("export async function mount() {}", encoding="utf-8")

    bundle = read_control_bundle(tmp_path)

    assert bundle["runtimePath"] == ".codex_controls/runtime.js"
    assert bundle["manifest"]["title"] == "Controls"
    assert bundle["manifest"]["initialState"] == {"strength": 2}
    assert bundle["manifest"]["changedElementHints"] == []


def test_normalize_control_runtime_path_rejects_escape_runtime_paths(tmp_path: Path) -> None:
    with pytest.raises(HTTPException, match="escapes the staged workspace"):
        normalize_control_runtime_path(tmp_path, "../../outside.js")


def test_sanitize_svg_strips_active_content() -> None:
    svg = """
    <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(1)</script>
      <a href="javascript:alert(2)">
        <rect onclick="alert(3)" width="10" height="10" />
      </a>
      <foreignObject><div>bad</div></foreignObject>
    </svg>
    """

    sanitized = sanitize_svg(svg)

    assert "<script" not in sanitized
    assert "foreignObject" not in sanitized
    assert "onclick" not in sanitized
    assert "onload" not in sanitized
    assert "javascript:" not in sanitized
