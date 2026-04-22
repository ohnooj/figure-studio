from fastapi import APIRouter

from ..models import ExportBundlePayload, PublishPayload
from ..services.exports import export_bundle, publish_exports

router = APIRouter()


@router.post("/api/export/bundle")
def export_bundle_route(payload: ExportBundlePayload) -> dict[str, object]:
    return export_bundle(payload.figure_id, payload.svg, payload.text)


@router.post("/api/publish")
def publish(payload: PublishPayload) -> dict[str, object]:
    return publish_exports(payload.figure_id, payload.sources, payload.targets)
