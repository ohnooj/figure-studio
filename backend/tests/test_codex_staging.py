import base64
from pathlib import Path

from backend.codex_staging import stage_annotated_image


def test_stage_annotated_image_writes_png_payload(tmp_path: Path) -> None:
    payload = base64.b64encode(b"png-bytes").decode("ascii")

    image_path = stage_annotated_image(tmp_path, f"data:image/png;base64,{payload}")

    assert image_path == tmp_path / "codex_attachment.png"
    assert image_path is not None
    assert image_path.read_bytes() == b"png-bytes"


def test_stage_annotated_image_rejects_non_data_urls(tmp_path: Path) -> None:
    image_path = stage_annotated_image(tmp_path, "https://example.com/image.png")

    assert image_path is None
