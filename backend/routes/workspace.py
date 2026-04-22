from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..events import create_event_stream
from ..models import WorkspacePayload
from ..runtime import broker
from ..services.workspace import TEMPLATE_LIBRARY, save_workspace, workspace

router = APIRouter()


@router.get("/api/health")
def health() -> dict[str, object]:
  return {"ok": True}


@router.get("/api/workspace")
def get_workspace() -> dict[str, object]:
  return workspace()


@router.put("/api/workspace")
def put_workspace(payload: WorkspacePayload) -> dict[str, object]:
  save_workspace(payload.model_dump())
  return payload.model_dump()


@router.get("/api/templates")
def get_templates() -> dict[str, object]:
  return {"templates": TEMPLATE_LIBRARY}


@router.get("/api/events")
async def events(request: Request) -> StreamingResponse:
  return StreamingResponse(create_event_stream(request, broker), media_type="text/event-stream")
