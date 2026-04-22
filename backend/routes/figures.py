from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

from ..models import (
    AssetImportPayload,
    FigureCreatePayload,
    FigureMetadataPayload,
    FigureSourceSavePayload,
)
from ..services.figures import (
    create_figure_entry,
    figure_file_response,
    get_figure_assets_payload,
    get_figure_payload,
    import_figure_asset,
    save_figure_source,
    update_figure_metadata_entry,
    upload_figure_assets,
)

router = APIRouter()


@router.post("/api/figure")
def create_figure(payload: FigureCreatePayload) -> dict[str, object]:
    return create_figure_entry(payload.id, payload.title, payload.template_id)


@router.put("/api/figure/{figure_id}/metadata")
def update_figure_metadata(figure_id: str, payload: FigureMetadataPayload) -> dict[str, object]:
    return update_figure_metadata_entry(figure_id, payload)


@router.get("/api/figure/{figure_id}")
def get_figure(figure_id: str) -> dict[str, object]:
    return get_figure_payload(figure_id)


@router.put("/api/figure/{figure_id}/source")
def save_figure_source_route(figure_id: str, payload: FigureSourceSavePayload) -> dict[str, object]:
    return save_figure_source(figure_id, payload.svg)


@router.get("/api/figure/{figure_id}/assets")
def get_figure_assets(figure_id: str) -> dict[str, object]:
    return get_figure_assets_payload(figure_id)


@router.post("/api/figure/{figure_id}/asset-import")
def import_figure_asset_route(figure_id: str, payload: AssetImportPayload) -> dict[str, object]:
    return import_figure_asset(figure_id, payload.source_path)


@router.post("/api/figure/{figure_id}/asset-upload")
async def upload_figure_assets_route(
    figure_id: str,
    files: Annotated[list[UploadFile], File(...)],
) -> dict[str, object]:
    return await upload_figure_assets(figure_id, files)


@router.get("/api/figure-file/{figure_id}/{path:path}")
def figure_file(figure_id: str, path: str) -> FileResponse:
    return figure_file_response(figure_id, path)
