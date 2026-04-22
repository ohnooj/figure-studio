type ImportMetaEnvShape = {
  DEV?: boolean;
  VITE_API_ROOT?: string;
};

function resolveApiRoot(): string {
  const env = import.meta.env as ImportMetaEnvShape;
  const configured = (env.VITE_API_ROOT ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (env.DEV) {
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
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ROOT}${path}`, {
    headers,
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
