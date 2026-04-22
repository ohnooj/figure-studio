from __future__ import annotations

import asyncio
import json
import queue
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from ..models import (
  CodexRunCreatePayload,
  CodexThreadCreatePayload,
  CodexThreadUpdatePayload,
  CodexVariantInteractivePayload,
  CodexVariantMarkPayload,
)
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
def list_codex_threads(figure_id: str | None = None, archived: bool = False) -> dict[str, object]:
    return {"threads": codex_store.list_threads(figure_id=figure_id, archived=archived)}


@router.post("/api/codex/threads")
def create_codex_thread(payload: CodexThreadCreatePayload) -> dict[str, object]:
    scope = payload.scope.strip() or "figure"
    title = payload.title.strip() or ("Global workspace chat" if scope == "global" else f"{payload.figure_id} chat")
    thread = codex_service.create_thread(
        figure_id=payload.figure_id,
        scope=scope,
        title=title,
        model=payload.model,
        reasoning_effort=payload.reasoning_effort,
        sandbox_mode=payload.sandbox_mode,
        approval_policy=payload.approval_policy,
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
    if payload.reasoning_effort is not None:
        updates["reasoning_effort"] = payload.reasoning_effort
    if payload.sandbox_mode is not None:
        updates["sandbox_mode"] = payload.sandbox_mode
    if payload.approval_policy is not None:
        updates["approval_policy"] = payload.approval_policy
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
        active_figure_id=payload.active_figure_id,
        results_count=payload.results_count,
        revision_variant_ids=payload.revision_variant_ids,
        figure_context=payload.figure_context,
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


@router.post("/api/codex/variants/{variant_id}/interactive")
def save_codex_variant_interactive(variant_id: str, payload: CodexVariantInteractivePayload) -> dict[str, object]:
    return {
        "run": codex_service.save_variant_interactive(
            variant_id,
            state=payload.state,
            preview_svg=payload.preview_svg,
            status=payload.status,
        ),
    }


@router.post("/api/codex/variants/{variant_id}/interactive/reset")
def reset_codex_variant_interactive(variant_id: str) -> dict[str, object]:
    return {"run": codex_service.reset_variant_interactive(variant_id)}


@router.get("/api/codex/variants/{variant_id}/control-runtime.js")
def codex_variant_control_runtime(variant_id: str) -> FileResponse:
  runtime_file = codex_service.get_variant_runtime_file(variant_id)
  return FileResponse(runtime_file, media_type="text/javascript")


@router.get("/api/codex/variants/{variant_id}/control-host")
def codex_variant_control_host(variant_id: str) -> HTMLResponse:
  get_codex_run_or_404(codex_store.get_variant(variant_id)["runId"])
  runtime_url = f"/api/codex/variants/{variant_id}/control-runtime.js"
  html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Codex Controls</title>
    <style>
      :root {{
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }}
      body {{
        margin: 0;
        padding: 12px;
        background: #f7f3ed;
        color: #231f1a;
      }}
      #root {{
        min-height: calc(100vh - 24px);
      }}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      const root = document.getElementById("root");
      let runtimeModule = null;
      let dispose = null;
      const runtimeUrl = {json.dumps(runtime_url)};

      function emit(type, payload = {{}}) {{
        parent.postMessage({{ source: "figure-studio-codex-controls", type, payload }}, "*");
      }}

      async function loadRuntime() {{
        if (runtimeModule) {{
          return runtimeModule;
        }}
        runtimeModule = await import(runtimeUrl);
        if (!runtimeModule || typeof runtimeModule.mount !== "function") {{
          throw new Error("Generated control runtime must export mount(root, context).");
        }}
        return runtimeModule;
      }}

      window.addEventListener("message", async (event) => {{
        const message = event.data ?? {{}};
        if (message?.source !== "figure-studio-codex-parent" || message?.type !== "init") {{
          return;
        }}
        try {{
          const payload = message.payload ?? {{}};
          if (dispose && typeof dispose === "function") {{
            dispose();
          }}
          root.replaceChildren();
          const runtime = await loadRuntime();
          const context = {{
            manifest: payload.manifest ?? null,
            initialState: payload.state ?? {{}},
            sourceSvg: payload.sourceSvg ?? "",
            generatedSvg: payload.generatedSvg ?? "",
            currentSvg: payload.currentSvg ?? "",
            setPreviewSvg(svg) {{
              emit("preview", {{ svg }});
            }},
            setState(state) {{
              emit("state", {{ state }});
            }},
            setStatus(status) {{
              emit("status", {{ status }});
            }},
          }};
          const result = await runtime.mount(root, context);
          dispose = typeof result === "function" ? result : (typeof runtime.dispose === "function" ? runtime.dispose : null);
          emit("ready");
        }} catch (error) {{
          emit("error", {{ message: error instanceof Error ? error.message : String(error) }});
        }}
      }});

      emit("host-ready");
    </script>
  </body>
</html>"""
  return HTMLResponse(html)


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
