import { api } from "./client";
import type { FigureEntry, FigureSource } from "../types/editor";

export function fetchFigure(figureId: string): Promise<FigureSource> {
  return api<FigureSource>(`/api/figure/${figureId}`);
}

export function createFigureFromTemplate(templateId: string): Promise<{ ok: boolean; id: string }> {
  return api<{ ok: boolean; id: string }>("/api/figure", {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

export function updateFigureMetadata(figureId: string, payload: { title: string; description: string }): Promise<{ ok: boolean; figure: FigureEntry }> {
  return api<{ ok: boolean; figure: FigureEntry }>(`/api/figure/${figureId}/metadata`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function saveFigureSource(figureId: string, svg: string): Promise<{ ok: boolean; sourceFiles: string[] }> {
  return api<{ ok: boolean; sourceFiles: string[] }>(`/api/figure/${figureId}/source`, {
    method: "PUT",
    body: JSON.stringify({ svg }),
  });
}

export function importFigureAsset(figureId: string, sourcePath: string): Promise<{ ok: boolean; relativePath: string }> {
  return api<{ ok: boolean; relativePath: string }>(`/api/figure/${figureId}/asset-import`, {
    method: "POST",
    body: JSON.stringify({ sourcePath }),
  });
}
