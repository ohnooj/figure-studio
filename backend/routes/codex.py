from __future__ import annotations

import asyncio
import json
import queue
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..models import CodexRunCreatePayload, CodexThreadCreatePayload, CodexThreadUpdatePayload, CodexVariantMarkPayload
from ..runtime import codex_run_broker, codex_service, codex_store


router = APIRouter()


def get_codex_thread_or_404(thread_id: str) -> dict[str, object]:
  try:
    return codex_store.get_thread(thread_id)
  except KeyError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


def get_codex_run_or_404(run_id: str) -> dict[str, object]:
  try:
    return codex_store.get_run(run_id)
  except KeyError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/api/codex/threads")
def list_codex_threads(figureId: str | None = None, archived: bool = False) -> dict[str, object]:
  return {"threads": codex_store.list_threads(figure_id=figureId, archived=archived)}


@router.post("/api/codex/threads")
def create_codex_thread(payload: CodexThreadCreatePayload) -> dict[str, object]:
  scope = payload.scope.strip() or "figure"
  title = payload.title.strip() or ("Global workspace chat" if scope == "global" else f"{payload.figureId} chat")
  thread = codex_service.create_thread(
    figure_id=payload.figureId,
    scope=scope,
    title=title,
    model=payload.model,
    reasoning_effort=payload.reasoningEffort,
    sandbox_mode=payload.sandboxMode,
    approval_policy=payload.approvalPolicy,
    personality=payload.personality,
  )
  return {"thread": thread}


@router.get("/api/codex/threads/{thread_id}")
def get_codex_thread(thread_id: str) -> dict[str, object]:
  return {"thread": get_codex_thread_or_404(thread_id)}


@router.patch("/api/codex/threads/{thread_id}")
def update_codex_thread(thread_id: str, payload: CodexThreadUpdatePayload) -> dict[str, object]:
  updates: dict[str, object] = {}
  if payload.title is not None:
    updates["title"] = payload.title.strip() or "Untitled chat"
  if payload.archived is not None:
    updates["archived"] = 1 if payload.archived else 0
  if payload.scope is not None:
    updates["scope"] = payload.scope.strip() or "figure"
  if payload.model is not None:
    updates["model"] = payload.model
  if payload.reasoningEffort is not None:
    updates["reasoning_effort"] = payload.reasoningEffort
  if payload.sandboxMode is not None:
    updates["sandbox_mode"] = payload.sandboxMode
  if payload.approvalPolicy is not None:
    updates["approval_policy"] = payload.approvalPolicy
  if payload.personality is not None:
    updates["personality"] = payload.personality
  try:
    thread = codex_store.update_thread(thread_id, **updates)
  except KeyError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  return {"thread": thread}


@router.post("/api/codex/threads/{thread_id}/clear")
def clear_codex_thread(thread_id: str) -> dict[str, object]:
  get_codex_thread_or_404(thread_id)
  return {"thread": codex_service.clear_thread(thread_id)}


@router.delete("/api/codex/threads/{thread_id}")
def delete_codex_thread(thread_id: str) -> dict[str, object]:
  get_codex_thread_or_404(thread_id)
  codex_service.delete_thread(thread_id)
  return {"ok": True}


@router.post("/api/codex/threads/{thread_id}/runs")
def create_codex_run(thread_id: str, payload: CodexRunCreatePayload) -> dict[str, object]:
  get_codex_thread_or_404(thread_id)
  run = codex_service.start_run(
    thread_id=thread_id,
    prompt=payload.prompt,
    active_figure_id=payload.activeFigureId,
    results_count=payload.resultsCount,
    revision_variant_ids=payload.revisionVariantIds,
    figure_context=payload.figureContext,
  )
  return {"run": run}


@router.get("/api/codex/runs/{run_id}")
def get_codex_run(run_id: str) -> dict[str, object]:
  return {"run": get_codex_run_or_404(run_id)}


@router.post("/api/codex/runs/{run_id}/cancel")
def cancel_codex_run(run_id: str) -> dict[str, object]:
  get_codex_run_or_404(run_id)
  return {"run": codex_service.cancel_run(run_id)}


@router.post("/api/codex/runs/{run_id}/apply")
def apply_codex_run(run_id: str) -> dict[str, object]:
  get_codex_run_or_404(run_id)
  return {"run": codex_service.apply_run(run_id)}


@router.post("/api/codex/runs/{run_id}/reject")
def reject_codex_run(run_id: str) -> dict[str, object]:
  get_codex_run_or_404(run_id)
  return {"run": codex_service.reject_run(run_id)}


@router.post("/api/codex/variants/{variant_id}/apply")
def apply_codex_variant(variant_id: str) -> dict[str, object]:
  return {"run": codex_service.apply_variant(variant_id)}


@router.post("/api/codex/variants/{variant_id}/reject")
def reject_codex_variant(variant_id: str) -> dict[str, object]:
  return {"run": codex_service.reject_variant(variant_id)}


@router.post("/api/codex/variants/{variant_id}/mark")
def mark_codex_variant(variant_id: str, payload: CodexVariantMarkPayload) -> dict[str, object]:
  return {"run": codex_service.mark_variant(variant_id, payload.marked)}


async def create_codex_run_stream(request: Request, run_id: str) -> AsyncIterator[str]:
  subscription = codex_run_broker.subscribe(run_id)
  replay = codex_store.list_run_events(run_id)
  try:
    yield "event: ready\ndata: {}\n\n"
    for event in replay:
      yield f"event: message\ndata: {json.dumps(event)}\n\n"
    while True:
      if await request.is_disconnected():
        break
      try:
        event = await asyncio.to_thread(subscription.get, True, 0.5)
      except queue.Empty:
        continue
      yield f"event: message\ndata: {json.dumps(event)}\n\n"
  except (asyncio.CancelledError, GeneratorExit):
    return
  finally:
    codex_run_broker.unsubscribe(run_id, subscription)


@router.get("/api/codex/runs/{run_id}/events")
async def codex_run_events(request: Request, run_id: str) -> StreamingResponse:
  get_codex_run_or_404(run_id)
  return StreamingResponse(create_codex_run_stream(request, run_id), media_type="text/event-stream")
