import { api } from "./client";
import type { TemplateEntry, Workspace } from "../types/editor";

export function fetchWorkspace(): Promise<Workspace> {
  return api<Workspace>("/api/workspace");
}

export function fetchTemplates(): Promise<{ templates: TemplateEntry[] }> {
  return api<{ templates: TemplateEntry[] }>("/api/templates");
}

export function fetchBackendHealth(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/health");
}
