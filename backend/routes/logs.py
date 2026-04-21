import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from ..models import DebugLogPayload


router = APIRouter()


def format_debug_record(source: str, label: str, payload: object | None, client_timestamp: str | None = None) -> tuple[str, dict[str, object]]:
  iso_ts = datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")
  record = {
    "ts": round(time.time(), 3),
    "isoTs": iso_ts,
    "source": source,
    "label": label,
    "payload": payload,
  }
  if client_timestamp is not None:
    record["clientTimestamp"] = client_timestamp
  return iso_ts, record


def print_debug_record(source: str, label: str, payload: object | None, client_timestamp: str | None = None) -> None:
  iso_ts, record = format_debug_record(source, label, payload, client_timestamp)
  print(f"[figure-debug {iso_ts}] {json.dumps(record, ensure_ascii=True)}", flush=True)


@router.post("/api/log/debug")
def debug_log(payload: DebugLogPayload) -> dict[str, object]:
  if payload.events:
    for event in payload.events:
      print_debug_record(event.source, event.label, event.payload, event.clientTimestamp)
    return {"ok": True, "count": len(payload.events)}
  print_debug_record(payload.source, payload.label or "unknown", payload.payload, payload.clientTimestamp)
  return {"ok": True, "count": 1}
