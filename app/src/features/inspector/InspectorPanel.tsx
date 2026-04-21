import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { AttributeEntry, InspectorCapabilities, InspectorStyle, SelectedElement } from "../../shared/types/editor";
import { ColorPopover } from "../../shared/components/ColorPopover";

function formatScrubValue(value: number, step: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (step >= 1) {
    return String(Math.round(value));
  }
  if (step >= 0.1) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function clampScrubValue(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === "number") {
    next = Math.max(min, next);
  }
  if (typeof max === "number") {
    next = Math.min(max, next);
  }
  return next;
}

function ScrubbableInput(props: {
  label: string;
  value: string;
  disabled?: boolean;
  inputMode?: "text" | "numeric";
  min?: number;
  max?: number;
  step?: number;
  onTextChange: (value: string) => void;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
}) {
  const step = props.step ?? 1;
  const dragStateRef = useRef<{ pointerId: number; originX: number; originValue: number; moved: boolean } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLInputElement>): void {
    if (props.disabled || event.button !== 0) {
      return;
    }
    const parsed = Number(props.value);
    const originValue = Number.isFinite(parsed) ? parsed : 0;
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originValue,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLInputElement>): void {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || props.disabled) {
      return;
    }
    const delta = event.clientX - dragState.originX;
    if (Math.abs(delta) < 4 && !dragState.moved) {
      return;
    }
    dragState.moved = true;
    const multiplier = event.shiftKey ? 0.2 : 1;
    const nextValue = clampScrubValue(dragState.originValue + delta * step * multiplier, props.min, props.max);
    const nextText = formatScrubValue(nextValue, step);
    props.onTextChange(nextText);
    props.onPreviewValue(nextValue);
    event.preventDefault();
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLInputElement>): void {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }
    const parsed = Number(props.value);
    const moved = dragStateRef.current.moved;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved && Number.isFinite(parsed)) {
      props.onCommitValue(clampScrubValue(parsed, props.min, props.max));
    }
  }

  return (
    <label className={props.disabled ? "scrub-field scrub-field-disabled" : "scrub-field"}>
      <span className="scrub-label-row">
        <span>{props.label}</span>
      </span>
      <input
        type="text"
        inputMode={props.inputMode === "numeric" ? "numeric" : "text"}
        value={props.value}
        disabled={props.disabled}
        className="scrub-input"
        onChange={(event) => props.onTextChange(event.target.value)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onBlur={() => {
          const parsed = Number(props.value);
          if (Number.isFinite(parsed)) {
            props.onCommitValue(clampScrubValue(parsed, props.min, props.max));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const parsed = Number(props.value);
            if (Number.isFinite(parsed)) {
              props.onCommitValue(clampScrubValue(parsed, props.min, props.max));
            }
          }
        }}
      />
    </label>
  );
}

export function InspectorPanel(props: {
  embedded?: boolean;
  width?: number;
  headerExtras?: ReactNode;
  selected: SelectedElement | null;
  artboardWidth: number;
  artboardHeight: number;
  selectedAttributes: AttributeEntry[];
  selectedResolvedStyle: InspectorStyle | null;
  selectedInspectorCapabilities: InspectorCapabilities | null;
  newAttributeName: string;
  newAttributeValue: string;
  onArtboardGeometryChange: (field: "width" | "height", value: number) => void;
  onArtboardGeometryPreview: (field: "width" | "height", value: number) => void;
  onGeometryChange: (field: "x" | "y" | "width" | "height" | "rotation", value: number) => void;
  onGeometryPreview: (field: "x" | "y" | "width" | "height" | "rotation", value: number) => void;
  onTextChange: (value: string) => void;
  onStyleNumberChange: (field: "stroke-width" | "opacity" | "fill-opacity" | "stroke-opacity" | "rx" | "ry" | "font-size", value: number) => void;
  onStyleNumberPreview: (field: "stroke-width" | "opacity" | "fill-opacity" | "stroke-opacity" | "rx" | "ry" | "font-size", value: number) => void;
  onStyleStringPreview: (field: "fill" | "stroke" | "stroke-dasharray" | "stroke-linecap" | "stroke-linejoin" | "font-family" | "font-weight" | "font-style" | "text-anchor", value: string) => void;
  onStyleStringChange: (field: "fill" | "stroke" | "stroke-dasharray" | "stroke-linecap" | "stroke-linejoin" | "font-family" | "font-weight" | "font-style" | "text-anchor", value: string) => void;
  onAttributeChange: (name: string, value: string) => void;
  onNewAttributeNameChange: (value: string) => void;
  onNewAttributeValueChange: (value: string) => void;
  onAddAttribute: () => void;
  onClearSlotImage: () => void;
}) {
  const [geometryDraft, setGeometryDraft] = useState({ x: "", y: "", width: "", height: "", rotation: "" });
  const [artboardDraft, setArtboardDraft] = useState({ width: "", height: "" });
  const [attributeDrafts, setAttributeDrafts] = useState<Record<string, string>>({});
  const resolvedValue = (name: keyof InspectorStyle): string => props.selectedResolvedStyle?.[name] ?? "";
  const numericStyleDraft = (name: keyof InspectorStyle, fallback = ""): string => {
    const value = attributeDrafts[name] ?? resolvedValue(name);
    return value || fallback;
  };
  const colorValue = (name: "fill" | "stroke"): string => {
    const value = resolvedValue(name);
    return /^#([0-9a-f]{6})$/i.test(value) ? value : "#2b648d";
  };
  const capabilities = props.selectedInspectorCapabilities;

  useEffect(() => {
    setArtboardDraft({
      width: String(Math.round(props.artboardWidth)),
      height: String(Math.round(props.artboardHeight)),
    });
  }, [props.artboardWidth, props.artboardHeight]);

  useEffect(() => {
    if (!props.selected) {
      setGeometryDraft({ x: "", y: "", width: "", height: "", rotation: "" });
      setAttributeDrafts({});
      return;
    }
    setGeometryDraft({
      x: String(Math.round(props.selected.x)),
      y: String(Math.round(props.selected.y)),
      width: String(Math.round(props.selected.width)),
      height: String(Math.round(props.selected.height)),
      rotation: String(Math.round(props.selected.rotation)),
    });
  }, [props.selected?.id, props.selected?.x, props.selected?.y, props.selected?.width, props.selected?.height, props.selected?.rotation]);

  useEffect(() => {
    setAttributeDrafts(
      Object.fromEntries(
        [
          ...props.selectedAttributes.map((attribute) => [attribute.name, attribute.value] as const),
          ...Object.entries(props.selectedResolvedStyle ?? {}),
        ],
      ),
    );
  }, [props.selected?.id, props.selectedAttributes, props.selectedResolvedStyle]);

  function commitAttribute(name: string): void {
    props.onAttributeChange(name, attributeDrafts[name] ?? "");
  }

  function paintSummary(name: "fill" | "stroke"): string {
    const value = resolvedValue(name);
    if (!value) {
      return "unset";
    }
    return value === "none" ? "none" : value;
  }

  const content = (
    <>
      <div className="section-heading">
        <h2>Inspector</h2>
        {props.headerExtras}
      </div>
      <div className="inspector-block">
        <label>Artboard</label>
        <div className="geometry-grid">
          <ScrubbableInput
            label="W"
            value={artboardDraft.width}
            inputMode="numeric"
            step={1}
            min={1}
            onTextChange={(value) => setArtboardDraft((current) => ({ ...current, width: value }))}
            onCommitValue={(value) => props.onArtboardGeometryChange("width", value)}
            onPreviewValue={(value) => props.onArtboardGeometryPreview("width", value)}
          />
          <ScrubbableInput
            label="H"
            value={artboardDraft.height}
            inputMode="numeric"
            step={1}
            min={1}
            onTextChange={(value) => setArtboardDraft((current) => ({ ...current, height: value }))}
            onCommitValue={(value) => props.onArtboardGeometryChange("height", value)}
            onPreviewValue={(value) => props.onArtboardGeometryPreview("height", value)}
          />
        </div>
      </div>
      {props.selected ? (
        <div className="inspector">
          <div className="readout">{props.selected.label}</div>
          <div className="readout">{props.selected.kind}</div>
          <div className="geometry-grid">
            <ScrubbableInput
              label="X"
              value={geometryDraft.x}
              inputMode="numeric"
              step={1}
              onTextChange={(value) => setGeometryDraft((current) => ({ ...current, x: value }))}
              onCommitValue={(value) => props.onGeometryChange("x", value)}
              onPreviewValue={(value) => props.onGeometryPreview("x", value)}
            />
            <ScrubbableInput
              label="Y"
              value={geometryDraft.y}
              inputMode="numeric"
              step={1}
              onTextChange={(value) => setGeometryDraft((current) => ({ ...current, y: value }))}
              onCommitValue={(value) => props.onGeometryChange("y", value)}
              onPreviewValue={(value) => props.onGeometryPreview("y", value)}
            />
            <ScrubbableInput
              label="R"
              value={geometryDraft.rotation}
              inputMode="numeric"
              step={1}
              onTextChange={(value) => setGeometryDraft((current) => ({ ...current, rotation: value }))}
              onCommitValue={(value) => props.onGeometryChange("rotation", value)}
              onPreviewValue={(value) => props.onGeometryPreview("rotation", value)}
            />
            <ScrubbableInput
              label="W"
              value={geometryDraft.width}
              inputMode="numeric"
              step={1}
              min={0}
              disabled={!props.selected.canResize}
              onTextChange={(value) => setGeometryDraft((current) => ({ ...current, width: value }))}
              onCommitValue={(value) => props.onGeometryChange("width", value)}
              onPreviewValue={(value) => props.onGeometryPreview("width", value)}
            />
            <ScrubbableInput
              label="H"
              value={geometryDraft.height}
              inputMode="numeric"
              step={1}
              min={0}
              disabled={!props.selected.canResize}
              onTextChange={(value) => setGeometryDraft((current) => ({ ...current, height: value }))}
              onCommitValue={(value) => props.onGeometryChange("height", value)}
              onPreviewValue={(value) => props.onGeometryPreview("height", value)}
            />
          </div>
          {(props.selected.kind === "text" || props.selected.kind === "slot") ? (
            <div className="inspector-block">
              <label>{props.selected.kind === "text" ? "Text" : "Slot Label"}</label>
              <textarea value={props.selected.text} onChange={(event) => props.onTextChange(event.target.value)} rows={4} />
            </div>
          ) : null}
          {capabilities?.showAppearance ? (
            <div className="inspector-block">
              <label>Appearance</label>
              <div className="style-grid">
                {capabilities.showFill ? (
                  <label>
                    Fill
                    <ColorPopover
                      value={colorValue("fill")}
                      ariaLabel="Fill color"
                      onPreview={(value) => props.onStyleStringPreview("fill", value)}
                      onCommit={(value) => props.onStyleStringChange("fill", value)}
                    />
                    <div className="paint-actions">
                      <span className="paint-value">{paintSummary("fill")}</span>
                      <button type="button" className={resolvedValue("fill") === "none" ? "visual-choice active" : "visual-choice"} onClick={() => props.onStyleStringChange("fill", "none")}>
                        None
                      </button>
                    </div>
                  </label>
                ) : null}
                {capabilities.showStroke ? (
                  <label>
                    Stroke
                    <ColorPopover
                      value={colorValue("stroke")}
                      ariaLabel="Stroke color"
                      onPreview={(value) => props.onStyleStringPreview("stroke", value)}
                      onCommit={(value) => props.onStyleStringChange("stroke", value)}
                    />
                    <div className="paint-actions">
                      <span className="paint-value">{paintSummary("stroke")}</span>
                      <button type="button" className={resolvedValue("stroke") === "none" ? "visual-choice active" : "visual-choice"} onClick={() => props.onStyleStringChange("stroke", "none")}>
                        None
                      </button>
                    </div>
                  </label>
                ) : null}
                {capabilities.showStrokeWidth ? (
                  <ScrubbableInput
                    label="Stroke W"
                    value={numericStyleDraft("stroke-width")}
                    inputMode="numeric"
                    step={0.1}
                    min={0}
                    onTextChange={(value) => setAttributeDrafts((current) => ({ ...current, "stroke-width": value }))}
                    onCommitValue={(value) => props.onStyleNumberChange("stroke-width", value)}
                    onPreviewValue={(value) => props.onStyleNumberPreview("stroke-width", value)}
                  />
                ) : null}
                {capabilities.showStrokeDash ? (
                  <label>
                Dash
                <div className="visual-choice-group" role="group" aria-label="Stroke dash pattern">
                  <button
                    type="button"
                    className={resolvedValue("stroke-dasharray") ? "visual-choice" : "visual-choice active"}
                    onClick={() => props.onStyleStringChange("stroke-dasharray", "")}
                    aria-label="Solid stroke"
                  >
                    <span className="dash-preview dash-preview-solid" />
                  </button>
                  <button
                    type="button"
                    className={resolvedValue("stroke-dasharray") === "10 6" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-dasharray", "10 6")}
                    aria-label="Dashed stroke"
                  >
                    <span className="dash-preview dash-preview-dashed" />
                  </button>
                  <button
                    type="button"
                    className={resolvedValue("stroke-dasharray") === "2 6" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-dasharray", "2 6")}
                    aria-label="Dotted stroke"
                  >
                    <span className="dash-preview dash-preview-dotted" />
                  </button>
                </div>
                  </label>
                ) : null}
                {capabilities.showLineCap ? (
                  <label>
                Line Cap
                <div className="visual-choice-group" role="group" aria-label="Line cap">
                  <button
                    type="button"
                    className={(resolvedValue("stroke-linecap") || "round") === "butt" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-linecap", "butt")}
                    aria-label="Butt line cap"
                  >
                    <span className="cap-preview cap-preview-butt" />
                  </button>
                  <button
                    type="button"
                    className={(resolvedValue("stroke-linecap") || "round") === "round" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-linecap", "round")}
                    aria-label="Round line cap"
                  >
                    <span className="cap-preview cap-preview-round" />
                  </button>
                  <button
                    type="button"
                    className={(resolvedValue("stroke-linecap") || "round") === "square" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-linecap", "square")}
                    aria-label="Square line cap"
                  >
                    <span className="cap-preview cap-preview-square" />
                  </button>
                </div>
                  </label>
                ) : null}
                {capabilities.showLineJoin ? (
                  <label>
                Line Join
                <div className="visual-choice-group" role="group" aria-label="Line join">
                  <button
                    type="button"
                    className={(resolvedValue("stroke-linejoin") || "round") === "miter" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-linejoin", "miter")}
                    aria-label="Miter line join"
                  >
                    <span className="join-preview join-preview-miter" />
                  </button>
                  <button
                    type="button"
                    className={(resolvedValue("stroke-linejoin") || "round") === "round" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-linejoin", "round")}
                    aria-label="Round line join"
                  >
                    <span className="join-preview join-preview-round" />
                  </button>
                  <button
                    type="button"
                    className={(resolvedValue("stroke-linejoin") || "round") === "bevel" ? "visual-choice active" : "visual-choice"}
                    onClick={() => props.onStyleStringChange("stroke-linejoin", "bevel")}
                    aria-label="Bevel line join"
                  >
                    <span className="join-preview join-preview-bevel" />
                  </button>
                </div>
                  </label>
                ) : null}
                {capabilities.showOpacity ? (
                  <ScrubbableInput
                label="Opacity"
                value={numericStyleDraft("opacity", "1")}
                inputMode="numeric"
                step={0.05}
                min={0}
                max={1}
                onTextChange={(value) => setAttributeDrafts((current) => ({ ...current, opacity: value }))}
                onCommitValue={(value) => props.onStyleNumberChange("opacity", value)}
                onPreviewValue={(value) => props.onStyleNumberPreview("opacity", value)}
              />
                ) : null}
                {capabilities.showFillOpacity ? (
                  <ScrubbableInput
                label="Fill Op."
                value={numericStyleDraft("fill-opacity", "1")}
                inputMode="numeric"
                step={0.05}
                min={0}
                max={1}
                onTextChange={(value) => setAttributeDrafts((current) => ({ ...current, "fill-opacity": value }))}
                onCommitValue={(value) => props.onStyleNumberChange("fill-opacity", value)}
                onPreviewValue={(value) => props.onStyleNumberPreview("fill-opacity", value)}
              />
                ) : null}
                {capabilities.showStrokeOpacity ? (
                  <ScrubbableInput
                label="Stroke Op."
                value={numericStyleDraft("stroke-opacity", "1")}
                inputMode="numeric"
                step={0.05}
                min={0}
                max={1}
                onTextChange={(value) => setAttributeDrafts((current) => ({ ...current, "stroke-opacity": value }))}
                onCommitValue={(value) => props.onStyleNumberChange("stroke-opacity", value)}
                onPreviewValue={(value) => props.onStyleNumberPreview("stroke-opacity", value)}
              />
                ) : null}
                {capabilities.showRadius ? (
                  <ScrubbableInput
                  label="Radius"
                  value={numericStyleDraft("rx", "0")}
                  inputMode="numeric"
                  step={1}
                  min={0}
                  onTextChange={(value) => setAttributeDrafts((current) => ({ ...current, rx: value, ry: value }))}
                  onCommitValue={(value) => {
                    props.onStyleNumberChange("rx", value);
                    props.onStyleNumberChange("ry", value);
                  }}
                  onPreviewValue={(value) => {
                    props.onStyleNumberPreview("rx", value);
                    props.onStyleNumberPreview("ry", value);
                  }}
                />
                ) : null}
              </div>
            </div>
          ) : null}
          {capabilities?.showTypography ? (
            <div className="inspector-block">
              <label>Typography</label>
              <div className="style-grid">
                <label>
                  Font
                  <input
                    type="text"
                    value={attributeDrafts["font-family"] ?? resolvedValue("font-family")}
                    onChange={(event) => {
                      const value = event.target.value;
                      setAttributeDrafts((current) => ({ ...current, "font-family": value }));
                      props.onStyleStringPreview("font-family", value);
                    }}
                    onBlur={() => props.onStyleStringChange("font-family", attributeDrafts["font-family"] ?? resolvedValue("font-family"))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        props.onStyleStringChange("font-family", attributeDrafts["font-family"] ?? resolvedValue("font-family"));
                      }
                    }}
                  />
                </label>
                <ScrubbableInput
                  label="Size"
                  value={numericStyleDraft("font-size")}
                  inputMode="numeric"
                  step={1}
                  min={1}
                  onTextChange={(value) => setAttributeDrafts((current) => ({ ...current, "font-size": value }))}
                  onCommitValue={(value) => props.onStyleNumberChange("font-size", value)}
                  onPreviewValue={(value) => props.onStyleNumberPreview("font-size", value)}
                />
                <label>
                  Weight
                  <input
                    type="text"
                    value={attributeDrafts["font-weight"] ?? resolvedValue("font-weight")}
                    onChange={(event) => {
                      const value = event.target.value;
                      setAttributeDrafts((current) => ({ ...current, "font-weight": value }));
                      props.onStyleStringPreview("font-weight", value);
                    }}
                    onBlur={() => props.onStyleStringChange("font-weight", attributeDrafts["font-weight"] ?? resolvedValue("font-weight"))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        props.onStyleStringChange("font-weight", attributeDrafts["font-weight"] ?? resolvedValue("font-weight"));
                      }
                    }}
                  />
                </label>
                <label>
                  Style
                  <select
                    value={resolvedValue("font-style") || "normal"}
                    onChange={(event) => {
                      props.onStyleStringPreview("font-style", event.target.value);
                      props.onStyleStringChange("font-style", event.target.value);
                    }}
                  >
                    <option value="normal">normal</option>
                    <option value="italic">italic</option>
                  </select>
                </label>
                <label>
                  Align
                  <select
                    value={resolvedValue("text-anchor") || "start"}
                    onChange={(event) => {
                      props.onStyleStringPreview("text-anchor", event.target.value);
                      props.onStyleStringChange("text-anchor", event.target.value);
                    }}
                  >
                    <option value="start">left</option>
                    <option value="middle">center</option>
                    <option value="end">right</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}
          {props.selected.kind === "slot" ? (
            <div className="inspector-block">
              <label>Image</label>
              <div className="readout">{props.selected.assetPath || "No image assigned"}</div>
              <button onClick={props.onClearSlotImage}>Clear Slot Image</button>
            </div>
          ) : null}
          <details className="inspector-block inspector-metadata">
            <summary>Metadata</summary>
            <div className="attribute-list">
              {props.selectedAttributes.map((attribute) => (
                <div key={attribute.name} className="attribute-row">
                  <input className="attribute-name" value={attribute.name} readOnly />
                  <input
                    value={attributeDrafts[attribute.name] ?? ""}
                    onChange={(event) =>
                      setAttributeDrafts((current) => ({ ...current, [attribute.name]: event.target.value }))
                    }
                    onBlur={() => commitAttribute(attribute.name)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitAttribute(attribute.name);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="metadata-add">
              <label>Add Attribute</label>
              <div className="attribute-row">
                <input
                  className="attribute-name"
                  value={props.newAttributeName}
                  placeholder="name"
                  onChange={(event) => props.onNewAttributeNameChange(event.target.value)}
                />
                <input
                  value={props.newAttributeValue}
                  placeholder="value"
                  onChange={(event) => props.onNewAttributeValueChange(event.target.value)}
                />
              </div>
              <button disabled={!props.newAttributeName.trim()} onClick={props.onAddAttribute}>
                Add Attribute
              </button>
            </div>
          </details>
        </div>
      ) : (
        <p className="empty-copy">Select an SVG panel, slot, text block, or annotation group in the canvas.</p>
      )}
    </>
  );
  if (props.embedded) {
    return content;
  }
  return (
    <aside className="right-rail panel" style={props.width ? { width: `${props.width}px` } : undefined}>
      {content}
    </aside>
  );
}
