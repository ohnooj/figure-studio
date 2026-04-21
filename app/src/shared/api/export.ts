import { api } from "./client";

export type ExportBundleResult = {
  ok: boolean;
  figureId: string;
  version: string;
  directory: string;
  svgPath: string;
  pdfPath: string;
  textPath?: string;
  pdf: {
    ok: boolean;
    error?: string;
    message?: string;
    svgPath: string;
    pdfPath: string;
  };
};

export function publishFigureAssets(figureId: string, sources: string[], targets: string[]): Promise<unknown> {
  return api("/api/publish", {
    method: "POST",
    body: JSON.stringify({ figureId, sources, targets }),
  });
}

export function exportFigureBundle(figureId: string, svg: string, text?: string): Promise<ExportBundleResult> {
  return api("/api/export/bundle", {
    method: "POST",
    body: JSON.stringify({ figureId, svg, text }),
  });
}
