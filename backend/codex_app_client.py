from __future__ import annotations

import json
import queue
import subprocess
import threading
from collections.abc import Callable
from typing import Any, cast

from fastapi import HTTPException

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

    def _send_response(
        self,
        request_id: int,
        *,
        result: Any | None = None,
        error: dict[str, Any] | None = None,
    ) -> None:
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
            raise HTTPException(
                status_code=504,
                detail=f"Timed out waiting for Codex App Server response: {method}",
            ) from error
        finally:
            self._pending.pop(request_id, None)
        if "error" in response:
            detail = response["error"]
            if isinstance(detail, dict):
                error_detail = cast(dict[str, object], detail)
                message = str(error_detail.get("message", "Codex request failed."))
            else:
                message = str(detail)
            raise HTTPException(status_code=502, detail=message)
        result = response.get("result", {})
        if not isinstance(result, dict):
            return {}
        return cast(dict[str, Any], result)

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
