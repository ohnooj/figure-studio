function resolveApiRoot(): string {
  const configured = (import.meta.env.VITE_API_ROOT ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://127.0.0.1:8123";
  }
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "http://127.0.0.1:8123";
}

const API_ROOT = resolveApiRoot();

export { API_ROOT };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    if (typeof payload === "object" && payload !== null && "detail" in payload) {
      throw new Error(String((payload as { detail: string }).detail));
    }
    if (typeof payload === "object" && payload !== null && "message" in payload) {
      throw new Error(String((payload as { message: string }).message));
    }
    throw new Error(typeof payload === "string" ? payload : `Request failed: ${response.status}`);
  }
  return payload as T;
}
