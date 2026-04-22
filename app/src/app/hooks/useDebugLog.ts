import { useCallback, useEffect, useRef } from "react";

import { API_ROOT } from "../../shared/api/client";

type DebugLogEvent = {
  source: string;
  label: string;
  payload: unknown;
  clientTimestamp: string;
};

const DEBUG_LOG_FLUSH_MS = 200;
function isHighFrequencyDebugEvent(label: string): boolean {
  return label.endsWith(".input")
    || label.endsWith(".preview")
    || label.startsWith("selection.refresh.")
    || label.startsWith("selection.overlay-refresh.");
}

function isEscalationDebugEvent(label: string, payload: unknown): boolean {
  if (label.endsWith(".slow")) {
    return true;
  }
  if (label.includes("error") || label.includes("failed")) {
    return true;
  }
  if (payload && typeof payload === "object") {
    const candidate = payload as { slow?: unknown; error?: unknown };
    return candidate.slow === true || candidate.error !== undefined;
  }
  return false;
}

function shouldSendToBackend(label: string, payload: unknown): boolean {
  if (isEscalationDebugEvent(label, payload)) {
    return true;
  }
  return !isHighFrequencyDebugEvent(label);
}

export function useDebugLog(debugLogging: boolean) {
  const bufferRef = useRef<DebugLogEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushBufferedEvents = useCallback((useBeacon = false): void => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (!bufferRef.current.length) {
      return;
    }
    const events = bufferRef.current.splice(0, bufferRef.current.length);
    const body = JSON.stringify({ events });
    if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        `${API_ROOT}/api/log/debug`,
        new Blob([body], { type: "application/json" }),
      );
      if (sent) {
        return;
      }
    }
    void fetch(`${API_ROOT}/api/log/debug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const scheduleBufferedFlush = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      return;
    }
    flushTimerRef.current = window.setTimeout(() => {
      flushBufferedEvents();
    }, DEBUG_LOG_FLUSH_MS);
  }, [flushBufferedEvents]);

  useEffect(() => {
    if (!debugLogging) {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      bufferRef.current = [];
      return;
    }
    const handlePageHide = (): void => {
      flushBufferedEvents(true);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flushBufferedEvents(true);
    };
  }, [debugLogging, flushBufferedEvents]);

  return useCallback((label: string, payload?: unknown): void => {
    if (!debugLogging) {
      return;
    }
    const clientTimestamp = new Date().toISOString();
    const event: DebugLogEvent = {
      source: "frontend",
      label,
      payload: payload ?? null,
      clientTimestamp,
    };
    if (!shouldSendToBackend(label, event.payload)) {
      return;
    }
    bufferRef.current.push(event);
    if (!isEscalationDebugEvent(label, event.payload)) {
      scheduleBufferedFlush();
      return;
    }
    flushBufferedEvents();
  }, [debugLogging, flushBufferedEvents, scheduleBufferedFlush]);
}
