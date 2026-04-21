import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { hexToHsva, hsvaToHex, type HsvaColor } from "@uiw/color-convert";
import ShadeSlider from "@uiw/react-color-shade-slider";
import Wheel from "@uiw/react-color-wheel";

const SWATCHES = ["#111827", "#ffffff", "#ef4444", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

function normalizeHex(value: string, fallback: string): string {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return fallback;
  }
  const raw = match[1];
  if (raw.length === 3) {
    return `#${raw.split("").map((char) => `${char}${char}`).join("").toLowerCase()}`;
  }
  return `#${raw.toLowerCase()}`;
}

export function ColorPopover(props: {
  value: string;
  disabled?: boolean;
  ariaLabel: string;
  inlineLabel?: string;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const fallback = "#2b648d";
  const color = normalizeHex(props.value, fallback);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [hsva, setHsva] = useState<HsvaColor>(() => hexToHsva(color));
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const pendingHexRef = useRef<string | null>(null);

  useEffect(() => {
    setHsva(hexToHsva(color));
  }, [color]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function updatePanelPosition(): void {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 12 - 240));
      const top = Math.min(rect.bottom + 6, Math.max(12, window.innerHeight - 12 - 320));
      setPanelPosition({ top, left });
    }
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        if (pendingHexRef.current) {
          props.onCommit(pendingHexRef.current);
          pendingHexRef.current = null;
        }
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        pendingHexRef.current = null;
        setHsva(hexToHsva(color));
        props.onPreview(color);
        setOpen(false);
      }
    }
    updatePanelPosition();
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 12 - 240));
    const top = Math.min(rect.bottom + 6, Math.max(12, window.innerHeight - 12 - 320));
    setPanelPosition({ top, left });
  }, [open]);

  const currentHex = useMemo(() => hsvaToHex(hsva), [hsva]);

  function preview(nextHsva: HsvaColor): void {
    const nextHex = hsvaToHex(nextHsva);
    setHsva(nextHsva);
    pendingHexRef.current = nextHex;
    props.onPreview(nextHex);
  }

  function commit(nextHex: string): void {
    pendingHexRef.current = null;
    props.onCommit(nextHex);
  }

  return (
    <div ref={rootRef} className={props.inlineLabel ? "color-popover color-popover-inline" : "color-popover"}>
      {props.inlineLabel ? <span className="color-popover-inline-label">{props.inlineLabel}</span> : null}
      <button
        type="button"
        className="color-popover-trigger"
        ref={triggerRef}
        aria-label={props.ariaLabel}
        aria-expanded={open}
        disabled={props.disabled}
        onClick={() => {
          setOpen((current) => {
            if (current && pendingHexRef.current) {
              commit(pendingHexRef.current);
            }
            return !current;
          });
        }}
      >
        <span className="color-popover-swatch" style={{ backgroundColor: currentHex }} />
      </button>
      {open ? (
        <div className="color-popover-panel panel color-popover-panel-floating" style={{ top: `${panelPosition.top}px`, left: `${panelPosition.left}px` }}>
          <div className="color-popover-wheel-wrap">
            <Wheel
              color={hsva}
              width={188}
              height={188}
              onChange={(next) => preview({ ...hsva, ...next.hsva })}
            />
          </div>
          <div className="color-popover-slider-block">
            <span className="color-popover-slider-label">Value</span>
            <ShadeSlider
              hsva={hsva}
              style={{ width: "100%" }}
              onChange={(nextShade) => preview({ ...hsva, ...nextShade })}
            />
          </div>
          <div className="color-popover-swatches" role="group" aria-label={`${props.ariaLabel} swatches`}>
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={swatch === currentHex ? "color-popover-swatch-button active" : "color-popover-swatch-button"}
                style={{ backgroundColor: swatch }}
                aria-label={`Use color ${swatch}`}
                onClick={() => {
                  const nextHsva = hexToHsva(swatch);
                  setHsva(nextHsva);
                  commit(swatch);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
