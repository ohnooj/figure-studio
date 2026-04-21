from __future__ import annotations

import base64
import json
import queue
import re
import shutil
import subprocess
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .codex_store import CodexStore
from .services.files import FIGURES_ROOT, ROOT, WORKSPACE_PATH, resolve_from_root
from .services.workspace import figure_entry, figure_entry_svg, figure_files, workspace_figures


EventCallback = Callable[[dict[str, Any]], None]


class CodexAppServerClient:
    def __init__(self) -> None:
        self._process: subprocess.Popen[str] | None = None
        self._stdout_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._request_id = 0
        self._pending: dict[int, queue.Queue[dict[str, Any]]] = {}
        self._callbacks: list[EventCallback] = []
        self._initialized = False

    def add_callback(self, callback: EventCallback) -> None:
        self._callbacks.append(callback)

    def _emit(self, message: dict[str, Any]) -> None:
        for callback in list(self._callbacks):
            callback(message)

    def ensure_started(self) -> None:
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                return
            self._start_process_locked()
        self.initialize()

    def _start_process_locked(self) -> None:
        self._process = subprocess.Popen(
            ["codex", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._initialized = False
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stderr_thread.start()

    def _read_stdout(self) -> None:
        assert self._process is not None and self._process.stdout is not None
        for line in self._process.stdout:
            raw = str(line).strip()
            if not raw:
                continue
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if "id" in message and ("result" in message or "error" in message):
                request_id = int(message["id"])
                pending = self._pending.get(request_id)
                if pending is not None:
                    pending.put(message)
                continue
            if "id" in message and "method" in message and "params" in message:
                # Server-initiated request. Reply with unsupported unless the caller intercepts.
                self._emit({"kind": "server_request", "message": message})
                self._send_response(
                    int(message["id"]),
                    error={"code": -32601, "message": "Unsupported by Figure Studio"},
                )
                continue
            self._emit({"kind": "notification", "message": message})

    def _read_stderr(self) -> None:
        assert self._process is not None and self._process.stderr is not None
        for line in self._process.stderr:
            text = str(line).strip()
            if text:
                self._emit({"kind": "stderr", "message": {"text": text}})

    def _send_message(self, payload: dict[str, Any]) -> None:
        self.ensure_started()
        assert self._process is not None and self._process.stdin is not None
        self._process.stdin.write(json.dumps(payload) + "\n")
        self._process.stdin.flush()

    def _send_response(self, request_id: int, *, result: Any | None = None, error: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id}
        if error is not None:
            payload["error"] = error
        else:
            payload["result"] = result
        self._send_message(payload)

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self.ensure_started()
        self._request_id += 1
        request_id = self._request_id
        inbox: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        self._pending[request_id] = inbox
        try:
            self._send_message(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": params,
                }
            )
            response = inbox.get(timeout=120)
        except queue.Empty as error:
            raise HTTPException(status_code=504, detail=f"Timed out waiting for Codex App Server response: {method}") from error
        finally:
            self._pending.pop(request_id, None)
        if "error" in response:
            detail = response["error"]
            if isinstance(detail, dict):
                message = str(detail.get("message", "Codex request failed."))
            else:
                message = str(detail)
            raise HTTPException(status_code=502, detail=message)
        return response.get("result", {})

    def initialize(self) -> dict[str, Any]:
        if self._initialized:
            return {}
        response = self.request(
            "initialize",
            {
                "clientInfo": {"name": "figure-studio", "version": "0.1.0"},
                "capabilities": {"experimentalApi": True},
            },
        )
        self._initialized = True
        return response


class CodexRunBroker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[str, list[queue.Queue[dict[str, Any]]]] = {}

    def subscribe(self, run_id: str) -> queue.Queue[dict[str, Any]]:
        subscription: queue.Queue[dict[str, Any]] = queue.Queue()
        with self._lock:
            self._subscribers.setdefault(run_id, []).append(subscription)
        return subscription

    def unsubscribe(self, run_id: str, subscription: queue.Queue[dict[str, Any]]) -> None:
        with self._lock:
            subscriptions = self._subscribers.get(run_id, [])
            if subscription in subscriptions:
                subscriptions.remove(subscription)
            if not subscriptions and run_id in self._subscribers:
                self._subscribers.pop(run_id, None)

    def publish(self, run_id: str, event: dict[str, Any]) -> None:
        with self._lock:
            subscribers = list(self._subscribers.get(run_id, []))
        for subscription in subscribers:
            subscription.put(event)


class CodexService:
    def __init__(self, store: CodexStore, broker: CodexRunBroker) -> None:
        self.store = store
        self.broker = broker
        self.client = CodexAppServerClient()
        self.client.add_callback(self._handle_app_server_message)
        self._lock = threading.Lock()
        self._native_thread_variant_map: dict[str, dict[str, str]] = {}

    def _publish(self, run_id: str, event_type: str, payload: dict[str, Any]) -> None:
        event = self.store.append_run_event(run_id, event_type, payload)
        self.broker.publish(run_id, event)

    @staticmethod
    def _stage_annotated_image(variant_staging_dir: Path, annotated_image_url: str) -> Path | None:
        value = annotated_image_url.strip()
        if not value:
            return None
        data_url_match = re.match(r"^data:(?P<mime>[^;,]+);base64,(?P<data>.+)$", value, re.DOTALL)
        if not data_url_match:
            return None
        mime_type = str(data_url_match.group("mime") or "").strip().lower()
        encoded = str(data_url_match.group("data") or "").strip()
        if not mime_type or not encoded:
            return None
        extension = {
            "image/svg+xml": "svg",
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
        }.get(mime_type)
        if not extension:
            return None
        try:
            payload = base64.b64decode(encoded, validate=True)
        except Exception:
            return None
        image_path = variant_staging_dir / f"codex_attachment.{extension}"
        image_path.write_bytes(payload)
        return image_path

    def _active_run_ids(self) -> list[str]:
        with self._lock:
            return sorted({payload["runId"] for payload in self._native_thread_variant_map.values()})

    def _aggregate_run(self, run_id: str) -> dict[str, Any]:
        variants = self.store.list_variants(run_id)
        if not variants:
            return self.store.update_run(run_id, state="queued", current_status="Queued")
        terminal_states = {"completed", "failed", "cancelled"}
        if any(variant["state"] in {"running", "waiting"} for variant in variants):
            completed = sum(1 for variant in variants if variant["state"] == "completed")
            return self.store.update_run(run_id, state="running", current_status=f"Running {completed}/{len(variants)} complete")
        if any(variant["state"] == "queued" for variant in variants):
            return self.store.update_run(run_id, state="queued", current_status="Queued")
        if all(variant["state"] in terminal_states for variant in variants):
            if any(variant["state"] == "completed" for variant in variants):
                return self.store.update_run(run_id, state="completed", current_status="Completed")
            if all(variant["state"] == "cancelled" for variant in variants):
                return self.store.update_run(run_id, state="cancelled", current_status="Cancelled")
            return self.store.update_run(run_id, state="failed", current_status="Failed")
        return self.store.get_run(run_id)

    def _prepare_revision_payload(self, thread_id: str, revision_variant_ids: list[str]) -> list[dict[str, Any]]:
        if not revision_variant_ids:
            return []
        payload: list[dict[str, Any]] = []
        for variant_id in revision_variant_ids:
            variant = self.store.get_variant(variant_id)
            run = self.store.get_run(variant["runId"])
            if run["threadId"] != thread_id:
                continue
            svg = str(variant.get("latestPreviewSvg") or "").strip()
            if not svg:
                continue
            payload.append(
                {
                    "variantId": variant["id"],
                    "variantLabel": variant["label"],
                    "sourcePrompt": run["prompt"],
                    "svg": svg,
                }
            )
        return payload

    def _handle_app_server_message(self, envelope: dict[str, Any]) -> None:
        kind = str(envelope.get("kind", ""))
        message = envelope.get("message", {})
        if kind == "stderr":
            for run_id in self._active_run_ids():
                self._publish(run_id, "codex.stderr", {"text": message.get("text", "")})
            return
        if kind == "server_request":
            params = message.get("params", {})
            native_thread_id = str(params.get("threadId", "") or "")
            mapping = self._native_thread_variant_map.get(native_thread_id)
            if mapping:
                self.store.update_variant(mapping["variantId"], state="waiting", current_status="Waiting on Codex approval.")
                self._aggregate_run(mapping["runId"])
                self._publish(
                    mapping["runId"],
                    "codex.serverRequest",
                    {"method": message.get("method"), "params": params, "variantId": mapping["variantId"]},
                )
            return
        method = str(message.get("method", "") or "")
        params = message.get("params", {})
        native_thread_id = str(params.get("threadId", "") or "")
        mapping = self._native_thread_variant_map.get(native_thread_id)
        if not mapping:
            return
        run_id = mapping["runId"]
        variant_id = mapping["variantId"]
        variant = self.store.get_variant(variant_id)
        if method == "thread/status/changed":
            status = params.get("status", {})
            self.store.update_variant(variant_id, current_status=json.dumps(status))
        elif method == "turn/started":
            turn = params.get("turn", {})
            self.store.update_variant(
                variant_id,
                state="running",
                native_turn_id=str(turn.get("id", "") or ""),
                current_status="Running",
            )
        elif method == "turn/diff/updated":
            run = self.store.get_run(run_id)
            scope = str(run.get("scopeSnapshot", "figure") or "figure")
            target_figure_id = str(run.get("targetFigureId", "") or "")
            staging_svg = self._read_staging_svg(Path(variant["stagingDir"]), scope, target_figure_id)
            self.store.update_variant(
                variant_id,
                latest_diff=str(params.get("diff", "") or ""),
                latest_preview_svg=staging_svg,
            )
        elif method == "turn/completed":
            run = self.store.get_run(run_id)
            scope = str(run.get("scopeSnapshot", "figure") or "figure")
            target_figure_id = str(run.get("targetFigureId", "") or "")
            self.store.update_variant(
                variant_id,
                state="completed",
                current_status="Completed",
                latest_preview_svg=self._read_staging_svg(Path(variant["stagingDir"]), scope, target_figure_id),
            )
            with self._lock:
                self._native_thread_variant_map.pop(native_thread_id, None)
        elif method == "error":
            error = params.get("error", {})
            self.store.update_variant(variant_id, state="failed", current_status=str(error.get("message", "Failed")))
            with self._lock:
                self._native_thread_variant_map.pop(native_thread_id, None)
        self._aggregate_run(run_id)
        self._publish(run_id, f"codex.{method.replace('/', '.')}", {**params, "variantId": variant_id})

    @staticmethod
    def _write_staging_agents_file(staging_dir: Path) -> None:
        source = ROOT / "AGENTS.md"
        if not source.exists():
            return
        (staging_dir / "AGENTS.md").write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    @staticmethod
    def _build_single_figure_staging_dir(staging_dir: Path, figure_id: str) -> None:
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        staging_dir.mkdir(parents=True, exist_ok=True)
        CodexService._write_staging_agents_file(staging_dir)
        entry = figure_entry(figure_id)
        source_dir = Path(resolve_from_root(str(entry["folder"])))
        shutil.copytree(source_dir, staging_dir, dirs_exist_ok=True)

    @staticmethod
    def _build_global_staging_dir(staging_dir: Path) -> None:
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        staging_dir.mkdir(parents=True, exist_ok=True)
        CodexService._write_staging_agents_file(staging_dir)
        figures_dir = staging_dir / "figures"
        figures_dir.mkdir(parents=True, exist_ok=True)
        manifest: list[dict[str, Any]] = []
        for entry in workspace_figures():
            figure_id = str(entry.get("id", "")).strip()
            if not figure_id:
                continue
            source_dir = Path(resolve_from_root(str(entry["folder"])))
            destination_dir = figures_dir / figure_id
            shutil.copytree(source_dir, destination_dir, dirs_exist_ok=True)
            manifest.append(
                {
                    "id": figure_id,
                    "title": str(entry.get("title", "")).strip(),
                    "folder": f"figures/{figure_id}",
                    "entrySvg": str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg",
                    "sourceFiles": [str(path.relative_to(staging_dir)) for path in sorted(destination_dir.rglob("*")) if path.is_file()],
                }
            )
        workspace_snapshot = WORKSPACE_PATH.read_text(encoding="utf-8") if WORKSPACE_PATH.exists() else "{}\n"
        (staging_dir / "workspace.json").write_text(workspace_snapshot, encoding="utf-8")
        (staging_dir / "workspace_manifest.json").write_text(
            json.dumps({"scope": "global", "figureCount": len(manifest), "figures": manifest}, indent=2) + "\n",
            encoding="utf-8",
        )

    @classmethod
    def _build_staging_dir(cls, staging_dir: Path, figure_id: str, scope: str) -> None:
        if scope == "global":
            cls._build_global_staging_dir(staging_dir)
            return
        cls._build_single_figure_staging_dir(staging_dir, figure_id)

    @staticmethod
    def _read_staging_svg(staging_dir: Path, scope: str, target_figure_id: str = "") -> str | None:
        if scope == "global":
            if not target_figure_id:
                return None
            svg_path = staging_dir / "figures" / target_figure_id / "figure.svg"
        else:
            svg_path = staging_dir / "figure.svg"
        if not svg_path.exists():
            return None
        return svg_path.read_text(encoding="utf-8")

    @staticmethod
    def _workspace_summary() -> list[dict[str, Any]]:
        summary: list[dict[str, Any]] = []
        for entry in workspace_figures():
            figure_id = str(entry.get("id", "")).strip()
            if not figure_id:
                continue
            summary.append(
                {
                    "figureId": figure_id,
                    "figureTitle": str(entry.get("title", "")).strip(),
                    "folder": str(entry.get("folder", "")).strip(),
                    "entrySvg": str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg",
                    "sourceFiles": figure_files(entry),
                }
            )
        return summary

    @staticmethod
    def _sync_global_staging_dir(staging_dir: Path) -> None:
        staged_figures_root = staging_dir / "figures"
        if not staged_figures_root.exists():
            raise HTTPException(status_code=404, detail="Staged global figures directory is missing.")
        for staged_path in sorted(staged_figures_root.rglob("*")):
            if not staged_path.is_file():
                continue
            relative_path = staged_path.relative_to(staged_figures_root)
            live_path = FIGURES_ROOT / relative_path
            live_path.parent.mkdir(parents=True, exist_ok=True)
            if live_path.exists() and live_path.read_bytes() == staged_path.read_bytes():
                continue
            shutil.copy2(staged_path, live_path)

    def _sync_single_figure_variant(self, staging_dir: Path, target_figure_id: str) -> None:
        entry = figure_entry(target_figure_id)
        live_svg_path = figure_entry_svg(entry)
        staged_svg_path = staging_dir / "figure.svg"
        if not staged_svg_path.exists():
            raise HTTPException(status_code=404, detail="Staged figure.svg is missing.")
        live_svg_path.write_text(staged_svg_path.read_text(encoding="utf-8"), encoding="utf-8")

    def create_thread(
        self,
        *,
        figure_id: str,
        scope: str,
        title: str,
        model: str | None,
        reasoning_effort: str | None,
        sandbox_mode: str,
        approval_policy: str,
        personality: str | None,
    ) -> dict[str, Any]:
        thread = self.store.create_thread(
            figure_id=figure_id,
            scope=scope,
            title=title,
            model=model,
            reasoning_effort=reasoning_effort,
            sandbox_mode=sandbox_mode,
            approval_policy=approval_policy,
            personality=personality,
        )
        self._build_staging_dir(Path(thread["stagingDir"]), figure_id, scope)
        return thread

    @staticmethod
    def _figure_target_summary(figure_id: str) -> dict[str, Any]:
        entry = figure_entry(figure_id)
        return {
            "figureId": figure_id,
            "figureTitle": str(entry.get("title", "")).strip(),
            "folder": str(entry.get("folder", "")).strip(),
            "entrySvg": str(entry.get("entrySvg", "figure.svg")).strip() or "figure.svg",
            "sourceFiles": figure_files(entry),
        }

    def _compose_variant_prompt(
        self,
        *,
        prompt: str,
        figure_context: dict[str, Any],
        target_figure: dict[str, Any],
        scope: str,
        variant_index: int,
        results_count: int,
        revision_payload: list[dict[str, Any]],
    ) -> str:
        distinct_instruction = (
            f"You are producing option {variant_index + 1} of {results_count}. Make it meaningfully distinct from the other options in composition, emphasis, or layout choices."
            if results_count > 1
            else "Produce one clear candidate result."
        )
        revision_text = ""
        if revision_payload:
            revision_text = f"\n\nRevision candidates (JSON):\n{json.dumps(revision_payload, indent=2)}"
        return f"{distinct_instruction}\n\n{self._compose_turn_prompt(prompt, figure_context, target_figure, scope)}{revision_text}"

    def start_run(
        self,
        *,
        thread_id: str,
        prompt: str,
        active_figure_id: str,
        results_count: int,
        revision_variant_ids: list[str],
        figure_context: dict[str, Any],
    ) -> dict[str, Any]:
        thread = self.store.get_thread(thread_id)
        if self.store.active_run_for_thread(thread_id) is not None:
            raise HTTPException(status_code=409, detail="This Codex thread already has an active run.")
        model = "gpt-5.4"
        scope = str(thread.get("scope", "figure") or "figure")
        reasoning_effort = str(thread.get("reasoningEffort") or "medium")
        target_figure = self._figure_target_summary(active_figure_id)
        total_results = max(1, min(3, results_count))
        revision_payload = self._prepare_revision_payload(thread_id, revision_variant_ids)

        run = self.store.create_run(
            thread_id=thread_id,
            prompt=prompt,
            target_figure_id=active_figure_id,
            scope_snapshot=scope,
            results_count=total_results,
            figure_context=figure_context,
        )
        self._publish(
            run["id"],
            "user.prompt",
            {
                "text": prompt,
                "activeFigureId": active_figure_id,
                "resultsCount": total_results,
                "revisionVariantIds": revision_variant_ids,
                "figureContext": figure_context,
            },
        )
        run_staging_root = Path(thread["stagingDir"]) / run["id"]
        for variant_index in range(total_results):
            variant_staging_dir = run_staging_root / f"option_{variant_index + 1}"
            self._build_staging_dir(variant_staging_dir, active_figure_id, scope)
            variant = self.store.create_variant(
                run_id=run["id"],
                variant_index=variant_index,
                label=f"Option {variant_index + 1}",
                staging_dir=str(variant_staging_dir),
            )
            response = self.client.request(
                "thread/start",
                {
                    "cwd": str(variant_staging_dir),
                    "model": model,
                    "reasoningEffort": reasoning_effort,
                    "sandbox": thread.get("sandboxMode"),
                    "approvalPolicy": thread.get("approvalPolicy"),
                    "developerInstructions": (
                        "You are editing the staged figure workspace in the current directory. "
                        "If only one figure is staged, prefer editing figure.svg directly. "
                        "If figures/ and workspace_manifest.json are present, treat that as a global multi-figure workspace "
                        "and keep edits inside the staged figure files. Explain intended SVG/file changes clearly."
                    ),
                },
            )
            native_thread = response.get("thread", {})
            native_thread_id = str(native_thread.get("id", "") or "")
            if not native_thread_id:
                raise HTTPException(status_code=502, detail="Codex App Server did not return a thread id.")
            self.store.update_variant(variant["id"], native_thread_id=native_thread_id)
            with self._lock:
                self._native_thread_variant_map[native_thread_id] = {
                    "runId": run["id"],
                    "variantId": variant["id"],
                }
            turn_input: list[dict[str, Any]] = [
                {
                    "type": "text",
                    "text": self._compose_variant_prompt(
                        prompt=prompt,
                        figure_context=figure_context,
                        target_figure=target_figure,
                        scope=scope,
                        variant_index=variant_index,
                        results_count=total_results,
                        revision_payload=revision_payload,
                    ),
                },
            ]
            image_attached = False
            annotated_image_url = str(figure_context.get("annotatedImageUrl", "") or "").strip()
            attachment_path = self._stage_annotated_image(variant_staging_dir, annotated_image_url) if annotated_image_url else None
            if attachment_path is not None:
                turn_input.append(
                    {
                        "type": "local_image",
                        "path": str(attachment_path),
                    }
                )
                image_attached = True
            turn_payload = {
                "threadId": native_thread_id,
                "input": turn_input,
                "model": model,
                "reasoning_effort": reasoning_effort,
                "approvalPolicy": thread.get("approvalPolicy"),
            }
            try:
                self.client.request("turn/start", turn_payload)
            except HTTPException as error:
                if not image_attached:
                    raise
                turn_payload["input"] = turn_input[:1]
                self.client.request("turn/start", turn_payload)
                self._publish(
                    run["id"],
                    "codex.warning",
                    {
                        "variantId": variant["id"],
                        "message": f"Image attachment was rejected by Codex and the run retried with text-only context: {error.detail}",
                    },
                )
        return self._aggregate_run(run["id"])

    def cancel_run(self, run_id: str) -> dict[str, Any]:
        run = self.store.get_run(run_id)
        variants = self.store.list_variants(run_id)
        interrupted = False
        for variant in variants:
            if not variant.get("nativeTurnId") or not variant.get("nativeThreadId"):
                self.store.update_variant(variant["id"], state="cancelled", current_status="Cancelled")
                continue
            self.client.request(
                "turn/interrupt",
                {
                    "threadId": variant["nativeThreadId"],
                    "turnId": variant["nativeTurnId"],
                },
            )
            self.store.update_variant(variant["id"], state="cancelled", current_status="Cancelled")
            with self._lock:
                self._native_thread_variant_map.pop(str(variant["nativeThreadId"]), None)
            interrupted = True
        self._publish(run_id, "run.cancelled", {})
        if not interrupted:
            return self.store.update_run(run_id, state="cancelled", current_status="Cancelled")
        return self._aggregate_run(run_id)

    def clear_thread(self, thread_id: str) -> dict[str, Any]:
        thread = self.store.get_thread(thread_id)
        if self.store.active_run_for_thread(thread_id) is not None:
            raise HTTPException(status_code=409, detail="Stop the active Codex run before clearing this chat.")
        with self._lock:
            self._native_thread_variant_map = {
                native_thread_id: payload
                for native_thread_id, payload in self._native_thread_variant_map.items()
                if self.store.get_run(payload["runId"])["threadId"] != thread_id
            }
        cleared = self.store.clear_thread(thread_id)
        self._build_staging_dir(
            Path(cleared["stagingDir"]),
            cleared["figureId"],
            str(cleared.get("scope", "figure") or "figure"),
        )
        return self.store.get_thread(thread_id)

    def delete_thread(self, thread_id: str) -> None:
        thread = self.store.get_thread(thread_id)
        if self.store.active_run_for_thread(thread_id) is not None:
            raise HTTPException(status_code=409, detail="Stop the active Codex run before deleting this chat.")
        with self._lock:
            self._native_thread_variant_map = {
                native_thread_id: payload
                for native_thread_id, payload in self._native_thread_variant_map.items()
                if self.store.get_run(payload["runId"])["threadId"] != thread_id
            }
        self.store.delete_thread(thread_id)

    def apply_run(self, run_id: str) -> dict[str, Any]:
        run = self.store.get_run(run_id)
        variants = [variant for variant in run.get("variants", []) if variant.get("reviewState") == "pending" and variant.get("state") == "completed"]
        if not variants:
            raise HTTPException(status_code=409, detail="No completed variant is available to apply.")
        return self.apply_variant(str(variants[0]["id"]))

    def reject_run(self, run_id: str) -> dict[str, Any]:
        run = self.store.get_run(run_id)
        variants = [variant for variant in run.get("variants", []) if variant.get("reviewState") == "pending"]
        if not variants:
            raise HTTPException(status_code=409, detail="No pending variant is available to reject.")
        return self.reject_variant(str(variants[0]["id"]))

    def apply_variant(self, variant_id: str) -> dict[str, Any]:
        variant = self.store.get_variant(variant_id)
        run = self.store.get_run(variant["runId"])
        if run.get("reviewState") == "applied":
            return run
        if variant.get("reviewState") != "pending":
            return run
        if variant.get("state") != "completed":
            raise HTTPException(status_code=409, detail="Only completed variants can be applied.")
        thread = self.store.get_thread(run["threadId"])
        scope = str(run.get("scopeSnapshot", "figure") or "figure")
        if scope == "global":
            self._sync_global_staging_dir(Path(variant["stagingDir"]))
        else:
            target_figure_id = str(run.get("targetFigureId", "") or thread.get("figureId", "") or "")
            self._sync_single_figure_variant(Path(variant["stagingDir"]), target_figure_id)
        self.store.update_variant(variant_id, review_state="applied", marked_for_revision=0)
        self.store.update_run(run["id"], review_state="applied", applied_variant_id=variant_id, current_status="Applied")
        self._publish(run["id"], "run.applied", {"variantId": variant_id, "targetFigureId": run.get("targetFigureId", ""), "scope": scope})
        return self.store.get_run(run["id"])

    def reject_variant(self, variant_id: str) -> dict[str, Any]:
        variant = self.store.get_variant(variant_id)
        run = self.store.get_run(variant["runId"])
        if run.get("reviewState") == "applied":
            return run
        if variant.get("reviewState") != "pending":
            return run
        self.store.update_variant(variant_id, review_state="rejected", marked_for_revision=0)
        self._publish(run["id"], "variant.rejected", {"variantId": variant_id})
        return self.store.get_run(run["id"])

    def mark_variant(self, variant_id: str, marked: bool) -> dict[str, Any]:
        variant = self.store.get_variant(variant_id)
        run = self.store.get_run(variant["runId"])
        if run.get("reviewState") == "applied":
            return run
        if variant.get("reviewState") != "pending":
            return run
        self.store.update_variant(variant_id, marked_for_revision=1 if marked else 0)
        self._publish(run["id"], "variant.marked", {"variantId": variant_id, "marked": marked})
        return self.store.get_run(run["id"])

    @staticmethod
    def _compose_turn_prompt(prompt: str, figure_context: dict[str, Any], target_figure: dict[str, Any], scope: str) -> str:
        has_figure_context = bool(
            figure_context.get("figureId")
            or figure_context.get("svg")
            or figure_context.get("selectedIds")
            or figure_context.get("selectedObjects")
            or figure_context.get("annotations")
        )
        context_payload = {
            "figureId": figure_context.get("figureId"),
            "figureTitle": figure_context.get("figureTitle"),
            "selectedIds": figure_context.get("selectedIds", []),
            "selectedObjects": figure_context.get("selectedObjects", []),
            "annotations": figure_context.get("annotations", []),
            "figureSvg": figure_context.get("svg", ""),
        }
        if not has_figure_context:
            if scope == "global":
                workspace_payload = {
                    "scope": "global",
                    "figures": CodexService._workspace_summary(),
                    "activeFigure": target_figure,
                }
                return f"{prompt.strip()}\n\nGlobal figure workspace context (JSON):\n{json.dumps(workspace_payload, indent=2)}"
            return f"{prompt.strip()}\n\nFigure target context (JSON):\n{json.dumps(target_figure, indent=2)}"
        if scope == "global":
            workspace_payload = {
                "scope": "global",
                "figures": CodexService._workspace_summary(),
                "activeFigure": target_figure,
                "activeFigureContext": context_payload,
            }
            return f"{prompt.strip()}\n\nGlobal figure workspace context (JSON):\n{json.dumps(workspace_payload, indent=2)}"
        payload = {
            "targetFigure": target_figure,
            "figureContext": context_payload,
        }
        return f"{prompt.strip()}\n\nFigure editing context (JSON):\n{json.dumps(payload, indent=2)}"
