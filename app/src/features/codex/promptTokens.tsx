import type { ReactNode } from "react";

import type { CodexAnnotation, CodexFigureContext, CodexSelectedObjectSummary, EditableKind } from "../../shared/types/editor";

export const CODEX_PROMPT_REFERENCE_MIME = "application/x-paper-figures-codex-ref";
export const CODEX_PROMPT_REFERENCE_MOVE_MIME = "application/x-paper-figures-codex-ref-move";

export type PromptReferenceToken = {
  kind: "object" | "annotation" | "gallery";
  id: string;
  label: string;
  objectKind?: EditableKind;
};

export type PromptSegment =
  | { type: "text"; text: string }
  | { type: "token"; token: PromptReferenceToken };

const TOKEN_PATTERN = /\[\[(object|annotation|gallery):([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]\]/g;

function sanitizeTokenValue(value: string): string {
  return value.replace(/[\]\|\r\n]+/g, " ").trim();
}

export function objectPromptLabel(item: CodexSelectedObjectSummary): string {
  return item.label.trim() || item.id;
}

export function annotationPromptLabel(annotation: CodexAnnotation, index: number): string {
  const prefix =
    annotation.kind === "selection"
      ? "Selection"
      : annotation.kind === "highlight"
        ? "Highlight"
        : annotation.kind === "arrow"
          ? "Arrow"
          : "Freehand";
  return `${prefix} ${index + 1}`;
}

export function serializePromptReferenceToken(token: PromptReferenceToken): string {
  const objectKindSuffix = token.kind === "object" && token.objectKind ? `|${sanitizeTokenValue(token.objectKind)}` : "";
  return `[[${token.kind}:${sanitizeTokenValue(token.id)}|${sanitizeTokenValue(token.label)}${objectKindSuffix}]]`;
}

export function parsePromptSegments(value: string): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", text: value.slice(lastIndex, index) });
    }
    const kind = match[1] === "annotation" ? "annotation" : match[1] === "gallery" ? "gallery" : "object";
    segments.push({
      type: "token",
      token: {
        kind,
        id: match[2] ?? "",
        label: match[3] ?? "",
        objectKind: kind === "object" && match[4] ? (match[4] as EditableKind) : undefined,
      },
    });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) {
    segments.push({ type: "text", text: value.slice(lastIndex) });
  }
  if (!segments.length) {
    segments.push({ type: "text", text: value });
  }
  return segments;
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function annotationById(context: CodexFigureContext | null | undefined, annotationId: string): CodexAnnotation | null {
  return context?.annotations.find((annotation) => annotation.id === annotationId) ?? null;
}

function objectById(context: CodexFigureContext | null | undefined, objectId: string): CodexSelectedObjectSummary | null {
  return context?.selectedObjects.find((item) => item.id === objectId) ?? null;
}

function syntheticObjectSummary(token: PromptReferenceToken): CodexSelectedObjectSummary | null {
  if (token.kind !== "object" || !token.objectKind) {
    return null;
  }
  return {
    id: token.id,
    label: token.label,
    kind: token.objectKind,
    x: 0,
    y: 0,
    width: 20,
    height: token.objectKind === "text" ? 10 : 14,
    rotation: 0,
    text: "",
    assetPath: "",
  };
}

function galleryPreviewSvg(label: string): string {
  const safeLabel = label.trim() || "Gallery";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 32">
    <rect x="4" y="5" width="48" height="22" rx="4" ry="4" fill="#f8f3ec" stroke="#5d5147" stroke-width="1.6"/>
    <rect x="9" y="10" width="17" height="12" rx="2" ry="2" fill="#e9ddd0" stroke="#8d7f72" stroke-width="1"/>
    <path d="M 13 19 L 17 15 L 20 17 L 24 13" fill="none" stroke="#8d7f72" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="31" y="18" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="5" fill="#5d5147">${safeLabel.slice(0, 10)}</text>
  </svg>`;
}

function annotationPreviewSvg(annotation: CodexAnnotation): string {
  const stroke = annotation.color || "#ff8a1f";
  if ((annotation.kind === "highlight" || annotation.kind === "selection") && annotation.points.length >= 2) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><rect x="6" y="5" width="28" height="14" rx="4" ry="4" fill="${annotation.kind === "selection" ? `${stroke}14` : `${stroke}22`}" stroke="${stroke}" stroke-width="2" ${annotation.kind === "selection" ? 'stroke-dasharray="5 3"' : ""}/></svg>`;
  }
  if (annotation.kind === "arrow") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><path d="M 7 17 L 31 7" fill="none" stroke="${stroke}" stroke-width="2.8" stroke-linecap="round"/><path d="M 31 7 L 24 7 M 31 7 L 29 14" fill="none" stroke="${stroke}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><path d="M 5 15 C 10 7, 14 18, 20 10 S 29 7, 35 14" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function objectPreviewSvg(item: CodexSelectedObjectSummary): string {
  const frameWidth = Math.max(14, Math.min(28, item.width > 0 && item.height > 0 ? (item.width / Math.max(item.height, 1)) * 14 : 20));
  const x = Math.round((40 - frameWidth) / 2);
  if (item.kind === "text") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><path d="M 9 8 H 31 M 13 12 H 27 M 10 16 H 30" fill="none" stroke="#5d5147" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  if (item.kind === "curve") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><path d="M 6 16 C 12 5, 19 20, 34 9" fill="none" stroke="#5d5147" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  }
  if (item.kind === "slot") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><rect x="${x}" y="5" width="${frameWidth}" height="14" rx="3" ry="3" fill="#f5f0e8" stroke="#5d5147" stroke-width="1.8"/><path d="M ${x + 4} 16 L ${x + 10} 11 L ${x + 15} 14 L ${x + frameWidth - 4} 8" fill="none" stroke="#8d7f72" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (item.kind === "group") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><rect x="${x + 3}" y="7" width="${Math.max(12, frameWidth - 6)}" height="10" rx="2.5" ry="2.5" fill="#ede5db" stroke="#5d5147" stroke-width="1.6"/><rect x="${x}" y="5" width="${Math.max(12, frameWidth - 6)}" height="10" rx="2.5" ry="2.5" fill="#f8f3ec" stroke="#5d5147" stroke-width="1.6"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><rect x="${x}" y="5" width="${frameWidth}" height="14" rx="3" ry="3" fill="#f8f3ec" stroke="#5d5147" stroke-width="1.8"/></svg>`;
}

export function promptTokenPreviewSrc(token: PromptReferenceToken, context?: CodexFigureContext | null): string | null {
  if (token.kind === "gallery") {
    return svgDataUrl(galleryPreviewSvg(token.label));
  }
  if (token.kind === "annotation") {
    const annotation = annotationById(context, token.id);
    return annotation ? svgDataUrl(annotationPreviewSvg(annotation)) : null;
  }
  const item = objectById(context, token.id) ?? syntheticObjectSummary(token);
  return item ? svgDataUrl(objectPreviewSvg(item)) : null;
}

export function renderPromptTokenContent(token: PromptReferenceToken, context?: CodexFigureContext | null): ReactNode {
  const previewSrc = promptTokenPreviewSrc(token, context);
  return (
    <>
      {previewSrc ? <img className="codex-prompt-token-preview" src={previewSrc} alt="" aria-hidden="true" /> : null}
      <span className={previewSrc ? "codex-prompt-token-label" : "codex-prompt-token-fallback"}>{token.label}</span>
    </>
  );
}

function renderTextSegment(text: string): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push(<br key={`br-${index}`} />);
    }
    if (line) {
      nodes.push(line);
    }
  });
  return nodes;
}

export function renderPromptSegments(value: string, context?: CodexFigureContext | null): ReactNode[] {
  return parsePromptSegments(value).flatMap((segment, index) => {
    if (segment.type === "text") {
      return (
        <span key={`text-${index}`} className="codex-prompt-text">
          {renderTextSegment(segment.text)}
        </span>
      );
    }
    return (
      <span
        key={`token-${index}`}
        className={`codex-prompt-token codex-prompt-token-${segment.token.kind}`}
        title={`${segment.token.kind}: ${segment.token.id}`}
      >
        {renderPromptTokenContent(segment.token, context)}
      </span>
    );
  });
}
