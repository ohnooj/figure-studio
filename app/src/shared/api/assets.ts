import { API_ROOT } from "./client";
import { api } from "./client";
import type { FigureAssets } from "../types/editor";

export function fetchFigureAssets(figureId: string): Promise<FigureAssets> {
  return api<FigureAssets>(`/api/figure/${figureId}/assets`);
}

export async function uploadFigureAssets(figureId: string, files: FileList): Promise<{ detail?: string; imported?: Array<{ name: string }> }> {
  const formData = new FormData();
  for (const file of Array.from(files)) {
    formData.append("files", file);
  }
  const response = await fetch(`${API_ROOT}/api/figure/${figureId}/asset-upload`, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as { detail?: string; imported?: Array<{ name: string }> };
  if (!response.ok) {
    throw new Error(payload.detail ?? "Upload failed.");
  }
  return payload;
}
