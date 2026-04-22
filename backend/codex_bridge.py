from __future__ import annotations

import json
import queue
import threading
from pathlib import Path
from typing import Any, cast

from fastapi import HTTPException

from .codex_app_client import CodexAppServerClient
from .codex_controls import normalize_control_runtime_path, read_control_bundle, sanitize_svg
from .codex_prompts import compose_variant_prompt, figure_target_summary
from .codex_staging import (
    build_staging_dir,
    read_staging_svg,
    stage_annotated_image,
    sync_global_staging_dir,
    sync_single_figure_variant,
    write_variant_preview_svg,
)
from .codex_store import CodexStore


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

    def get_variant_runtime_file(self, variant_id: str) -> Path:
        variant = self.store.get_variant(variant_id)
        runtime_path = str(variant.get("controlRuntimePath") or "").strip()
        if not runtime_path:
            raise HTTPException(status_code=404, detail="This Codex variant does not have a generated control runtime.")
        _, candidate = normalize_control_runtime_path(Path(variant["stagingDir"]), runtime_path)
        return candidate

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
            staging_svg = read_staging_svg(Path(variant["stagingDir"]), scope, target_figure_id)
            updates: dict[str, Any] = {
                "latest_diff": str(params.get("diff", "") or ""),
                "latest_preview_svg": staging_svg,
            }
            try:
                bundle = read_control_bundle(Path(variant["stagingDir"]))
            except HTTPException:
                bundle = None
            if bundle is not None:
                updates["control_manifest_json"] = json.dumps(bundle["manifest"])
                updates["control_runtime_path"] = bundle["runtimePath"]
                updates["control_status"] = "Generated controls ready."
            self.store.update_variant(variant_id, **updates)
        elif method == "turn/completed":
            run = self.store.get_run(run_id)
            scope = str(run.get("scopeSnapshot", "figure") or "figure")
            target_figure_id = str(run.get("targetFigureId", "") or "")
            try:
                bundle = read_control_bundle(Path(variant["stagingDir"]))
            except HTTPException as error:
                self.store.update_variant(
                    variant_id,
                    state="failed",
                    current_status=str(error.detail),
                    control_status=str(error.detail),
                    latest_preview_svg=read_staging_svg(Path(variant["stagingDir"]), scope, target_figure_id),
                )
            else:
                self.store.update_variant(
                    variant_id,
                    state="completed",
                    current_status="Completed",
                    latest_preview_svg=read_staging_svg(Path(variant["stagingDir"]), scope, target_figure_id),
                    control_manifest_json=json.dumps(bundle["manifest"]),
                    control_runtime_path=bundle["runtimePath"],
                    interactive_state_json=json.dumps(bundle["manifest"].get("initialState", {})),
                    interactive_preview_svg=None,
                    control_status="Generated controls ready.",
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
        build_staging_dir(Path(thread["stagingDir"]), figure_id, scope)
        return thread

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
        target_figure = figure_target_summary(active_figure_id)
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
            build_staging_dir(variant_staging_dir, active_figure_id, scope)
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
                    "text": compose_variant_prompt(
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
            attachment_path = stage_annotated_image(variant_staging_dir, annotated_image_url) if annotated_image_url else None
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
        self.store.get_run(run_id)
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
        self.store.get_thread(thread_id)
        if self.store.active_run_for_thread(thread_id) is not None:
            raise HTTPException(status_code=409, detail="Stop the active Codex run before clearing this chat.")
        with self._lock:
            self._native_thread_variant_map = {
                native_thread_id: payload
                for native_thread_id, payload in self._native_thread_variant_map.items()
                if self.store.get_run(payload["runId"])["threadId"] != thread_id
            }
        cleared = self.store.clear_thread(thread_id)
        build_staging_dir(
            Path(cleared["stagingDir"]),
            cleared["figureId"],
            str(cleared.get("scope", "figure") or "figure"),
        )
        return self.store.get_thread(thread_id)

    def delete_thread(self, thread_id: str) -> None:
        self.store.get_thread(thread_id)
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
        interactive_preview_svg = str(variant.get("interactivePreviewSvg") or "").strip()
        if interactive_preview_svg:
            target_figure_id = str(run.get("targetFigureId", "") or thread.get("figureId", "") or "")
            write_variant_preview_svg(Path(variant["stagingDir"]), scope, target_figure_id, interactive_preview_svg)
        if scope == "global":
            sync_global_staging_dir(Path(variant["stagingDir"]))
        else:
            target_figure_id = str(run.get("targetFigureId", "") or thread.get("figureId", "") or "")
            sync_single_figure_variant(Path(variant["stagingDir"]), target_figure_id)
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

    def save_variant_interactive(
        self,
        variant_id: str,
        *,
        state: dict[str, Any],
        preview_svg: str | None,
        status: str | None,
    ) -> dict[str, Any]:
        variant = self.store.get_variant(variant_id)
        run = self.store.get_run(variant["runId"])
        if run.get("reviewState") == "applied" or variant.get("reviewState") != "pending":
            raise HTTPException(status_code=409, detail="Only pending variants can be tuned.")
        if not variant.get("controlManifest"):
            raise HTTPException(status_code=409, detail="This variant does not have generated controls.")
        sanitized_svg = sanitize_svg(preview_svg) if preview_svg and preview_svg.strip() else None
        self.store.update_variant(
            variant_id,
            interactive_state_json=json.dumps(state),
            interactive_preview_svg=sanitized_svg,
            control_status=(status or "Generated controls ready.").strip(),
        )
        self._publish(run["id"], "variant.interactive.updated", {"variantId": variant_id})
        return self.store.get_run(run["id"])

    def reset_variant_interactive(self, variant_id: str) -> dict[str, Any]:
        variant = self.store.get_variant(variant_id)
        run = self.store.get_run(variant["runId"])
        if run.get("reviewState") == "applied" or variant.get("reviewState") != "pending":
            raise HTTPException(status_code=409, detail="Only pending variants can be reset.")
        raw_manifest = variant.get("controlManifest")
        manifest = cast(dict[str, object], raw_manifest) if isinstance(raw_manifest, dict) else {}
        initial_state = manifest.get("initialState", {})
        if not isinstance(initial_state, dict):
            initial_state = {}
        self.store.update_variant(
            variant_id,
            interactive_state_json=json.dumps(initial_state),
            interactive_preview_svg=None,
            control_status="Reset to generated output.",
        )
        self._publish(run["id"], "variant.interactive.reset", {"variantId": variant_id})
        return self.store.get_run(run["id"])
