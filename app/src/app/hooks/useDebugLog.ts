import { useCallback, useEffect, useRef } from "react";

import { API_ROOT } from "../../shared/api/client";

type DebugLogEvent = {
  source: string;
  label: string;
  payload: unknown | null;
  clientTimestamp: string;
};

const DEBUG_LOG_FLUSH_MS = 200;
const DEBUG_LOG_MAX_CHARS = 4000;

function normalizeDebugValue(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeDebugValue(entry));
  }
  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeDebugValue(entry),
    ]);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
}

function formatDebugPayload(payload: unknown): string {
  if (payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  try {
    const serialized = JSON.stringify(normalizeDebugValue(payload));
    if (!serialized) {
      return String(payload);
    }
    if (serialized.length <= DEBUG_LOG_MAX_CHARS) {
      return serialized;
    }
    return `${serialized.slice(0, DEBUG_LOG_MAX_CHARS)}...<truncated>`;
  } catch {
    return String(payload);
  }
}

function isHighFrequencyDebugEvent(label: string): boolean {
  return label.endsWith(".input")
    || label.endsWith(".preview")
    || label.startsWith("selection.refresh.")
    || label.startsWith("selection.overlay-refresh.");
}

function isEscalationDebugEvent(label: string, payload: unknown | null): boolean {
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

function shouldSendToBackend(label: string, payload: unknown | null): boolean {
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
    const formattedPayload = payload === undefined ? "" : ` ${formatDebugPayload(payload)}`;
    console.log(`[figure-debug ${clientTimestamp}] ${label}${formattedPayload}`);
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
