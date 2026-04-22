import type { DragEvent as ReactDragEvent } from "react";

import type { CodexFigureContext } from "../../shared/types/editor";
import { CODEX_PROMPT_REFERENCE_MIME, referenceChipId, renderPromptTokenContent, serializePromptReferenceToken } from "./promptTokens";
import type { CodexReferenceToken } from "./useCodexReferenceTokens";

type SelectionState = {
  selectedCodexAnnotationId: string;
  hoveredCodexAnnotationId: string;
  linkedObjectIds: string[];
  hoveredObjectId: string;
};

type HoverHandlers = {
  onHoverAnnotation: (annotationId: string) => void;
  onHoverObject: (objectId: string) => void;
};

function startReferenceDrag(event: ReactDragEvent<HTMLButtonElement>, token: CodexReferenceToken): void {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
  event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
}

function tokenClassName(token: CodexReferenceToken, selectedState: SelectionState, figureContext: CodexFigureContext | null): string {
  return [
    "codex-reference-chip",
    token.kind === "annotation" ? "codex-reference-chip-annotation" : "",
    token.kind === "annotation" && selectedState.selectedCodexAnnotationId === token.id ? "active" : "",
    token.kind === "annotation" && selectedState.hoveredCodexAnnotationId === token.id ? "hovered" : "",
    token.kind === "object" && (figureContext?.selectedIds.includes(token.id) ? "active" : ""),
    token.kind === "object" && (selectedState.hoveredObjectId === token.id || selectedState.linkedObjectIds.includes(token.id)) ? "linked" : "",
  ].filter(Boolean).join(" ");
}

function CodexReferenceRow(props: {
  label: string;
  tokens: CodexReferenceToken[];
  figureContext: CodexFigureContext | null;
  selectedState: SelectionState;
  hoverHandlers: HoverHandlers;
}) {
  if (!props.tokens.length) {
    return null;
  }
  return (
    <div className="codex-reference-row">
      <span className="codex-reference-label">{props.label}</span>
      <div className="codex-reference-chips">
        {props.tokens.map((token) => (
          <button
            key={`${token.kind}:${token.id}`}
            type="button"
            draggable
            className={tokenClassName(token, props.selectedState, props.figureContext)}
            data-reference-chip-id={referenceChipId(token)}
            title={`Drag ${token.label} into the prompt`}
            onDragStart={(event) => startReferenceDrag(event, token)}
            onMouseEnter={() => {
              if (token.kind === "annotation") {
                props.hoverHandlers.onHoverAnnotation(token.id);
                return;
              }
              props.hoverHandlers.onHoverObject(token.id);
            }}
            onMouseLeave={() => {
              if (token.kind === "annotation") {
                props.hoverHandlers.onHoverAnnotation("");
                return;
              }
              props.hoverHandlers.onHoverObject("");
            }}
          >
            {renderPromptTokenContent(token, props.figureContext)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CodexReferenceChips(props: {
  figureContext: CodexFigureContext | null;
  hasVisualReferences: boolean;
  referenceTokens: { objects: CodexReferenceToken[]; annotations: CodexReferenceToken[] };
  recentReferenceTokens: CodexReferenceToken[];
  selectedState: SelectionState;
  hoverHandlers: HoverHandlers;
}) {
  if (!props.hasVisualReferences) {
    return null;
  }
  return (
    <div className="codex-reference-inline">
      <div className="codex-reference-panel-header">
        <span className="codex-eyebrow">Reference Chips</span>
        <span className="codex-shortcut-hint">Drag into your prompt</span>
      </div>
      <div className="codex-reference-inline-body">
        <CodexReferenceRow
          label="Recent"
          tokens={props.recentReferenceTokens}
          figureContext={props.figureContext}
          selectedState={props.selectedState}
          hoverHandlers={props.hoverHandlers}
        />
        <CodexReferenceRow
          label="Objects"
          tokens={props.referenceTokens.objects}
          figureContext={props.figureContext}
          selectedState={props.selectedState}
          hoverHandlers={props.hoverHandlers}
        />
        <CodexReferenceRow
          label="Annotations"
          tokens={props.referenceTokens.annotations}
          figureContext={props.figureContext}
          selectedState={props.selectedState}
          hoverHandlers={props.hoverHandlers}
        />
      </div>
    </div>
  );
}
