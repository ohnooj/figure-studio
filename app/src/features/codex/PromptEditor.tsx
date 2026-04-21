import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { CodexFigureContext } from "../../shared/types/editor";
import { CODEX_PROMPT_REFERENCE_MIME, CODEX_PROMPT_REFERENCE_MOVE_MIME, parsePromptSegments, promptTokenPreviewSrc, serializePromptReferenceToken, type PromptReferenceToken } from "./promptTokens";

let promptTokenInstanceCounter = 0;

function tokenElement(documentRef: Document, token: PromptReferenceToken, figureContext: CodexFigureContext | null): HTMLSpanElement {
  const element = documentRef.createElement("span");
  element.className = `codex-prompt-token codex-reference-chip codex-prompt-token-${token.kind}${token.kind === "annotation" ? " codex-reference-chip-annotation codex-prompt-token-annotation" : ""}`;
  element.dataset.tokenKind = token.kind;
  element.dataset.tokenId = token.id;
  element.dataset.tokenLabel = token.label;
  if (token.objectKind) {
    element.dataset.tokenObjectKind = token.objectKind;
  }
  element.dataset.tokenInstance = `prompt-token-${promptTokenInstanceCounter += 1}`;
  element.contentEditable = "false";
  element.draggable = true;
  element.title = `${token.kind}: ${token.id}`;
  const previewSrc = promptTokenPreviewSrc(token, figureContext);
  if (previewSrc) {
    const image = documentRef.createElement("img");
    image.className = "codex-prompt-token-preview";
    image.src = previewSrc;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    element.appendChild(image);
  }
  const label = documentRef.createElement("span");
  label.className = previewSrc ? "codex-prompt-token-label" : "codex-prompt-token-fallback";
  label.textContent = token.label;
  element.appendChild(label);
  return element;
}

function buildPromptFragment(documentRef: Document, value: string, figureContext: CodexFigureContext | null): DocumentFragment {
  const fragment = documentRef.createDocumentFragment();
  for (const segment of parsePromptSegments(value)) {
    if (segment.type === "text") {
      const lines = segment.text.split("\n");
      lines.forEach((line, index) => {
        if (index > 0) {
          fragment.appendChild(documentRef.createElement("br"));
        }
        if (line) {
          fragment.appendChild(documentRef.createTextNode(line));
        }
      });
      continue;
    }
    fragment.appendChild(tokenElement(documentRef, segment.token, figureContext));
  }
  return fragment;
}

function serializePrompt(root: HTMLElement): string {
  function visit(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    if (node.tagName === "BR") {
      return "\n";
    }
    const tokenKind = node.dataset.tokenKind;
    const tokenId = node.dataset.tokenId;
    const tokenLabel = node.dataset.tokenLabel;
    const tokenObjectKind = node.dataset.tokenObjectKind;
    if ((tokenKind === "object" || tokenKind === "annotation" || tokenKind === "gallery") && tokenId && tokenLabel) {
      return serializePromptReferenceToken({
        kind: tokenKind,
        id: tokenId,
        label: tokenLabel,
        objectKind: tokenKind === "object" && tokenObjectKind ? tokenObjectKind as PromptReferenceToken["objectKind"] : undefined,
      });
    }
    let output = "";
    node.childNodes.forEach((child) => {
      output += visit(child);
    });
    if (node.tagName === "DIV" || node.tagName === "P") {
      output += "\n";
    }
    return output;
  }

  let serialized = "";
  root.childNodes.forEach((child) => {
    serialized += visit(child);
  });
  return serialized.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n");
}

function syncEditorContent(root: HTMLDivElement, value: string, figureContext: CodexFigureContext | null): void {
  const serialized = serializePrompt(root);
  if (serialized === value) {
    return;
  }
  root.replaceChildren(buildPromptFragment(root.ownerDocument, value, figureContext));
}

function moveCaretToEnd(root: HTMLDivElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveCaretToPoint(root: HTMLDivElement, clientX: number, clientY: number): boolean {
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  const documentRef = root.ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof documentRef.caretPositionFromPoint === "function") {
    const position = documentRef.caretPositionFromPoint(clientX, clientY);
    if (position && root.contains(position.offsetNode)) {
      const range = documentRef.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  }
  if (typeof documentRef.caretRangeFromPoint === "function") {
    const range = documentRef.caretRangeFromPoint(clientX, clientY);
    if (range && root.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  }
  return false;
}

function insertReferenceAtSelection(root: HTMLDivElement, token: PromptReferenceToken, figureContext: CodexFigureContext | null): void {
  root.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    root.appendChild(tokenElement(root.ownerDocument, token, figureContext));
    root.appendChild(root.ownerDocument.createTextNode(" "));
    moveCaretToEnd(root);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = root.ownerDocument.createDocumentFragment();
  fragment.appendChild(tokenElement(root.ownerDocument, token, figureContext));
  fragment.appendChild(root.ownerDocument.createTextNode(" "));
  range.insertNode(fragment);
  selection.removeAllRanges();
  moveCaretToEnd(root);
}

function selectionCaretInside(root: HTMLDivElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const anchorNode = selection.anchorNode;
  return Boolean(anchorNode && root.contains(anchorNode));
}

export function PromptEditor(props: {
  id: string;
  value: string;
  figureContext: CodexFigureContext | null;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const suppressTokenClickRef = useRef(false);
  const empty = useMemo(() => !props.value, [props.value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    syncEditorContent(editor, props.value, props.figureContext);
  }, [props.figureContext, props.value]);

  return (
    <div
      id={props.id}
      ref={editorRef}
      className="codex-prompt-editor"
      contentEditable={!props.disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-disabled={props.disabled}
      data-placeholder={props.placeholder}
      data-empty={empty ? "true" : "false"}
      onInput={(event) => {
        props.onChange(serializePrompt(event.currentTarget));
      }}
      onKeyDown={(event) => {
        props.onKeyDown(event);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      onDragOver={(event) => {
        if (props.disabled) {
          return;
        }
        if (event.dataTransfer.types.includes(CODEX_PROMPT_REFERENCE_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = event.dataTransfer.types.includes(CODEX_PROMPT_REFERENCE_MOVE_MIME) ? "move" : "copy";
        }
      }}
      onDragStart={(event) => {
        if (props.disabled) {
          return;
        }
        const tokenNode = (event.target as HTMLElement | null)?.closest(".codex-prompt-token");
        if (!(tokenNode instanceof HTMLElement)) {
          return;
        }
        const tokenKind = tokenNode.dataset.tokenKind;
        const tokenId = tokenNode.dataset.tokenId;
        const tokenLabel = tokenNode.dataset.tokenLabel;
        const tokenObjectKind = tokenNode.dataset.tokenObjectKind;
        const tokenInstance = tokenNode.dataset.tokenInstance;
        if ((tokenKind !== "object" && tokenKind !== "annotation" && tokenKind !== "gallery") || !tokenId || !tokenLabel || !tokenInstance) {
          return;
        }
        suppressTokenClickRef.current = true;
        const token: PromptReferenceToken = {
          kind: tokenKind,
          id: tokenId,
          label: tokenLabel,
          objectKind: tokenKind === "object" && tokenObjectKind ? tokenObjectKind as PromptReferenceToken["objectKind"] : undefined,
        };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
        event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MOVE_MIME, tokenInstance);
        event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
      }}
      onDrop={(event) => {
        if (props.disabled) {
          return;
        }
        const serialized = event.dataTransfer.getData(CODEX_PROMPT_REFERENCE_MIME);
        if (!serialized) {
          return;
        }
        event.preventDefault();
        const token = JSON.parse(serialized) as PromptReferenceToken;
        const movingInstance = event.dataTransfer.getData(CODEX_PROMPT_REFERENCE_MOVE_MIME);
        if (!moveCaretToPoint(event.currentTarget, event.clientX, event.clientY) && !selectionCaretInside(event.currentTarget)) {
          moveCaretToEnd(event.currentTarget);
        }
        insertReferenceAtSelection(event.currentTarget, token, props.figureContext);
        if (movingInstance) {
          const staleToken = event.currentTarget.querySelector(`[data-token-instance="${movingInstance}"]`);
          if (staleToken instanceof HTMLElement) {
            staleToken.remove();
          }
        }
        props.onChange(serializePrompt(event.currentTarget));
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          suppressTokenClickRef.current = false;
        }, 0);
      }}
      onClick={(event) => {
        const tokenNode = (event.target as HTMLElement | null)?.closest(".codex-prompt-token");
        if (!(tokenNode instanceof HTMLElement) || !editorRef.current || props.disabled) {
          return;
        }
        if (suppressTokenClickRef.current) {
          return;
        }
        tokenNode.remove();
        props.onChange(serializePrompt(editorRef.current));
      }}
    />
  );
}
