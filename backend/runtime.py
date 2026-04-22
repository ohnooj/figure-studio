from __future__ import annotations

import threading

from .codex_bridge import CodexRunBroker, CodexService
from .codex_store import CodexStore
from .events import FileEventBroker, watch_paths
from .services.files import FIGURES_ROOT, ROOT, TEMPLATES_ROOT, WORKSPACE_PATH

broker = FileEventBroker()
codex_store = CodexStore()
codex_run_broker = CodexRunBroker()
codex_service = CodexService(codex_store, codex_run_broker)
watch_stop = threading.Event()
watch_thread: threading.Thread | None = None


def start_runtime() -> None:
  global watch_thread
  if watch_thread and watch_thread.is_alive():
    return
  watch_stop.clear()
  watch_thread = threading.Thread(
    target=watch_paths,
    args=(ROOT, WORKSPACE_PATH, TEMPLATES_ROOT, FIGURES_ROOT, broker, watch_stop),
    daemon=True,
  )
  watch_thread.start()


def stop_runtime() -> None:
  watch_stop.set()
