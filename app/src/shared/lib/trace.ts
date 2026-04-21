type DebugLog = ((label: string, payload?: unknown) => void) | undefined;

type TraceOperation = {
  id: string;
  label: string;
  startedAt: number;
};

let traceCounter = 0;

export function startTraceOperation(debugLog: DebugLog, label: string, payload?: unknown): TraceOperation {
  const operation = {
    id: `${label}-${Date.now()}-${traceCounter += 1}`,
    label,
    startedAt: performance.now(),
  };
  debugLog?.(`${label}.start`, { operationId: operation.id, ...asObject(payload) });
  return operation;
}

export function traceOperationDuration(
  debugLog: DebugLog,
  operation: TraceOperation,
  phase: string,
  startedAt: number,
  payload?: unknown,
): void {
  debugLog?.(`${operation.label}.${phase}`, {
    operationId: operation.id,
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
    ...asObject(payload),
  });
}

export function traceOperationEvent(debugLog: DebugLog, operation: TraceOperation, event: string, payload?: unknown): void {
  debugLog?.(`${operation.label}.${event}`, { operationId: operation.id, ...asObject(payload) });
}

export function endTraceOperation(debugLog: DebugLog, operation: TraceOperation, payload?: unknown): void {
  debugLog?.(`${operation.label}.end`, {
    operationId: operation.id,
    totalDurationMs: Number((performance.now() - operation.startedAt).toFixed(3)),
    ...asObject(payload),
  });
}

function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}
