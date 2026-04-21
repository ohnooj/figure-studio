from __future__ import annotations

import asyncio
import json
import queue
import threading
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import Request


class FileEventBroker:
    def __init__(self) -> None:
        self.subscribers: list[queue.Queue[str]] = []

    def subscribe(self) -> queue.Queue[str]:
        subscription: queue.Queue[str] = queue.Queue()
        self.subscribers.append(subscription)
        return subscription

    def unsubscribe(self, subscription: queue.Queue[str]) -> None:
        if subscription in self.subscribers:
            self.subscribers.remove(subscription)

    def publish(self, message: str) -> None:
        for subscription in list(self.subscribers):
            subscription.put(message)


def watch_paths(
    root: Path,
    workspace_path: Path,
    templates_root: Path,
    figures_root: Path,
    broker: FileEventBroker,
    stop_event: threading.Event,
) -> None:
    tracked: dict[Path, float] = {}
    while not stop_event.is_set():
        candidates = [workspace_path]
        if templates_root.exists():
            candidates.extend(path for path in templates_root.rglob("*") if path.is_file())
        if figures_root.exists():
            candidates.extend(path for path in figures_root.rglob("*") if path.is_file())
        for path in candidates:
            if not path.exists():
                continue
            stamp = path.stat().st_mtime
            previous = tracked.get(path)
            if previous is not None and stamp != previous:
                broker.publish(json.dumps({"type": "file_changed", "path": str(path.relative_to(root))}))
            tracked[path] = stamp
        stop_event.wait(1.0)


async def create_event_stream(request: Request, broker: FileEventBroker) -> AsyncIterator[str]:
    subscription = broker.subscribe()
    try:
        yield "event: ready\ndata: {}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                message = await asyncio.to_thread(subscription.get, True, 0.5)
            except queue.Empty:
                continue
            yield f"event: message\ndata: {message}\n\n"
    except (asyncio.CancelledError, GeneratorExit):
        return
    finally:
        broker.unsubscribe(subscription)
