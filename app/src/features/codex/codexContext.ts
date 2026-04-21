import type {
  CodexAnnotation,
  CodexFigureContext,
  CodexSelectedObjectSummary,
  FigureSource,
} from "../../shared/types/editor";

const CODEX_HIGHLIGHT_PALETTE = [
  "#ff5d73",
  "#2ec5ff",
  "#ffb020",
  "#7b61ff",
  "#00c389",
  "#ff7a1a",
  "#ff4fc3",
  "#16b8a6",
];

export const EMPTY_FIGURE_CONTEXT: CodexFigureContext = {
  figureId: "",
  figureTitle: "",
  svg: "",
  selectedIds: [],
  selectedObjects: [],
  annotations: [],
};

export function nextCodexHighlightColor(annotations: CodexAnnotation[]): string {
  const used = new Set(annotations.filter((annotation) => annotation.kind === "highlight").map((annotation) => annotation.color.toLowerCase()));
  const available = CODEX_HIGHLIGHT_PALETTE.filter((color) => !used.has(color.toLowerCase()));
  const pool = available.length ? available : CODEX_HIGHLIGHT_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)] ?? CODEX_HIGHLIGHT_PALETTE[0];
}

function svgToBase64DataUrl(svg: string): string {
  const utf8 = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of utf8) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export function buildFigureContext(
  figureSource: FigureSource,
  selectedObjects: CodexSelectedObjectSummary[],
  annotations: CodexAnnotation[],
  options?: { includeAnnotatedImage?: boolean },
): CodexFigureContext {
  return {
    figureId: figureSource.figure.id,
    figureTitle: figureSource.figure.title,
    svg: figureSource.svg,
    selectedIds: selectedObjects.map((item) => item.id),
    selectedObjects,
    annotations,
    annotatedImageUrl: options?.includeAnnotatedImage === false ? undefined : svgToBase64DataUrl(figureSource.svg),
  };
}
