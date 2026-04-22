import { useEffect, useMemo, useRef, useState } from "react";

import { resetCodexVariantInteractive, saveCodexVariantInteractive } from "../../shared/api/codex";
import type { CodexRun, CodexRunVariant } from "../../shared/types/editor";

type HostMessage =
  | { source: "figure-studio-codex-controls"; type: "host-ready"; payload?: Record<string, unknown> }
  | { source: "figure-studio-codex-controls"; type: "ready"; payload?: Record<string, unknown> }
  | { source: "figure-studio-codex-controls"; type: "state"; payload?: { state?: Record<string, unknown> } }
  | { source: "figure-studio-codex-controls"; type: "preview"; payload?: { svg?: string } }
  | { source: "figure-studio-codex-controls"; type: "status"; payload?: { status?: string } }
  | { source: "figure-studio-codex-controls"; type: "error"; payload?: { message?: string } };

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function dispatchRunRefresh(run: CodexRun): void {
  window.dispatchEvent(new CustomEvent("paper_figures:codex_run_refresh", { detail: { run } }));
}

export function GeneratedControlsPanel(props: {
  embedded?: boolean;
  run: CodexRun;
  variant: CodexRunVariant;
  onApply: (variant: CodexRunVariant) => Promise<void>;
  onReject: (variant: CodexRunVariant) => Promise<void>;
  onStatus: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ state: Record<string, unknown>; previewSvg: string | null; status: string | null } | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [localState, setLocalState] = useState<Record<string, unknown>>(props.variant.interactiveState ?? props.variant.controlManifest?.initialState ?? {});
  const [previewSvg, setPreviewSvg] = useState<string | null>(props.variant.interactivePreviewSvg ?? props.variant.latestPreviewSvg ?? null);
  const [controlStatus, setControlStatus] = useState(props.variant.controlStatus ?? "Generated controls ready.");
  const manifest = props.variant.controlManifest;

  const currentPreviewSvg = useMemo(
    () => previewSvg ?? props.variant.interactivePreviewSvg ?? props.variant.latestPreviewSvg ?? "",
    [previewSvg, props.variant.interactivePreviewSvg, props.variant.latestPreviewSvg],
  );

  useEffect(() => {
    setLocalState(props.variant.interactiveState ?? props.variant.controlManifest?.initialState ?? {});
    setPreviewSvg(props.variant.interactivePreviewSvg ?? props.variant.latestPreviewSvg ?? null);
    setControlStatus(props.variant.controlStatus ?? "Generated controls ready.");
    setHostReady(false);
    setFrameKey((current) => current + 1);
  }, [props.variant.id, props.variant.updatedAt, props.variant.interactivePreviewSvg, props.variant.controlStatus, props.variant.interactiveState, props.variant.latestPreviewSvg, props.variant.controlManifest]);

  useEffect(() => {
    function sendInit(): void {
      const target = iframeRef.current?.contentWindow;
      if (!target || !manifest) {
        return;
      }
      target.postMessage(
        {
          source: "figure-studio-codex-parent",
          type: "init",
          payload: {
            manifest,
            state: localState,
            sourceSvg: props.run.figureContext.svg ?? "",
            generatedSvg: props.variant.latestPreviewSvg ?? "",
            currentSvg: currentPreviewSvg,
          },
        },
        "*",
      );
    }

    function queueSave(next: { state: Record<string, unknown>; previewSvg: string | null; status: string | null }): void {
      pendingRef.current = next;
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        const pending = pendingRef.current;
        pendingRef.current = null;
        saveTimerRef.current = null;
        if (!pending) {
          return;
        }
        setPersisting(true);
        void saveCodexVariantInteractive(props.variant.id, pending)
          .then((response) => {
            dispatchRunRefresh(response.run);
          })
          .catch((error: unknown) => {
            props.onStatus(error instanceof Error ? error.message : "Failed to save generated control state.", "error");
          })
          .finally(() => setPersisting(false));
      }, 220);
    }

    const onMessage = (event: MessageEvent<HostMessage>): void => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      const message = event.data;
      if (!message || message.source !== "figure-studio-codex-controls") {
        return;
      }
      if (message.type === "host-ready") {
        setHostReady(true);
        sendInit();
        return;
      }
      if (message.type === "ready") {
        return;
      }
      if (message.type === "error") {
        props.onStatus(message.payload?.message || "Generated controls failed to load.", "error");
        return;
      }
      if (message.type === "state") {
        const nextState = message.payload?.state && typeof message.payload.state === "object" ? message.payload.state : {};
        setLocalState(nextState);
        queueSave({ state: nextState, previewSvg: currentPreviewSvg || null, status: controlStatus });
        return;
      }
      if (message.type === "preview") {
        const nextSvg = typeof message.payload?.svg === "string" ? message.payload.svg : "";
        setPreviewSvg(nextSvg);
        queueSave({ state: localState, previewSvg: nextSvg, status: controlStatus });
        return;
      }
      if (message.type === "status") {
        const nextStatus = typeof message.payload?.status === "string" ? message.payload.status : "";
        setControlStatus(nextStatus);
        queueSave({ state: localState, previewSvg: currentPreviewSvg || null, status: nextStatus });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [controlStatus, currentPreviewSvg, localState, manifest, props, props.run.figureContext.svg, props.variant.id, props.variant.latestPreviewSvg]);

  if (!manifest || !props.variant.controlHostUrl) {
    return (
      <div className="inspector generated-controls-panel">
        <div className="section-heading">
          <h2>Codex Controls</h2>
        </div>
        <p className="empty-copy">This variant did not generate a control bundle.</p>
      </div>
    );
  }

  const content = (
    <>
      <div className="section-heading">
        <h2>Codex Controls</h2>
        <div className="generated-controls-actions">
          {persisting ? <span className="codex-meta-chip">Saving…</span> : null}
          {controlStatus ? <span className="codex-meta-chip">{controlStatus}</span> : null}
        </div>
      </div>
      <div className="generated-controls-meta inspector-block">
        <div className="readout">{manifest.title || props.variant.label}</div>
        {manifest.intentSummary ? <p className="codex-muted">{manifest.intentSummary}</p> : null}
      </div>
      <div className="inspector-block generated-controls-host-shell">
        <label>Interactive Controls</label>
        <iframe
          key={`${props.variant.id}:${frameKey}`}
          ref={iframeRef}
          className="generated-controls-frame"
          src={props.variant.controlHostUrl}
          sandbox="allow-scripts"
          title={`Generated controls for ${props.variant.label}`}
          onLoad={() => {
            if (hostReady) {
              iframeRef.current?.contentWindow?.postMessage(
                {
                  source: "figure-studio-codex-parent",
                  type: "init",
                  payload: {
                    manifest,
                    state: localState,
                    sourceSvg: props.run.figureContext.svg ?? "",
                    generatedSvg: props.variant.latestPreviewSvg ?? "",
                    currentSvg: currentPreviewSvg,
                  },
                },
                "*",
              );
            }
          }}
        />
      </div>
      {currentPreviewSvg ? (
        <div className="inspector-block generated-controls-preview">
          <label>Live Variant Preview</label>
          <div className="generated-controls-preview-frame">
            <img src={svgToDataUrl(currentPreviewSvg)} alt={`${props.variant.label} preview`} />
          </div>
        </div>
      ) : null}
      <div className="generated-controls-footer">
        <button
          type="button"
          className="codex-header-button"
          onClick={() => {
            setPersisting(true);
            void resetCodexVariantInteractive(props.variant.id)
              .then((response) => {
                dispatchRunRefresh(response.run);
                props.onStatus(`Reset ${props.variant.label} controls.`, "info");
              })
              .catch((error: unknown) => {
                props.onStatus(error instanceof Error ? error.message : "Failed to reset generated controls.", "error");
              })
              .finally(() => setPersisting(false));
          }}
        >
          Reset
        </button>
        <button type="button" className="codex-header-button" onClick={() => void props.onReject(props.variant)}>
          Reject
        </button>
        <button type="button" className="codex-header-button" onClick={() => void props.onApply(props.variant)} disabled={props.variant.state !== "completed"}>
          Apply
        </button>
      </div>
    </>
  );

  if (props.embedded) {
    return <div className="inspector generated-controls-panel">{content}</div>;
  }
  return content;
}
