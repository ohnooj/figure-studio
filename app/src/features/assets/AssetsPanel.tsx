import { useRef } from "react";
import type { ChangeEvent, Ref } from "react";

import { useScrollShadowState } from "../../shared/hooks/useScrollShadowState";
import type { ActionState, FigureAssets } from "../../shared/types/editor";

function AssetList(props: { items: { origin: string; path: string; sourcePath: string; name: string }[]; prefix: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { canScrollStart, canScrollEnd } = useScrollShadowState(scrollRef, "vertical", [props.items.length]);

  return (
    <div className={["scroll-shadow-frame", "scroll-shadow-vertical", canScrollStart ? "can-scroll-start" : "", canScrollEnd ? "can-scroll-end" : ""].filter(Boolean).join(" ")}>
      <div className="asset-list" ref={scrollRef}>
        {props.items.map((item) => (
          <div
            key={`${props.prefix}:${item.path}`}
            className="asset-card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", item.sourcePath);
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <span className="asset-name">{item.name}</span>
            <span className="asset-path">{item.path}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssetsPanel(props: {
  activeFigureId: string;
  actionState: ActionState;
  activeAssets: FigureAssets | null;
  uploadRef: Ref<HTMLInputElement>;
  onOpenUpload: () => void;
  onUploadFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="rail-pane asset-section">
      <div className="section-heading">
        <h2>Assets</h2>
        <div className="asset-actions">
          <button disabled={!props.activeFigureId || props.actionState !== "idle"} onClick={props.onOpenUpload}>
            Import
          </button>
          <button disabled={!props.activeFigureId || props.actionState !== "idle"} onClick={props.onRefresh}>
            Refresh
          </button>
        </div>
      </div>
      <input ref={props.uploadRef} type="file" accept="image/*" multiple hidden onChange={props.onUploadFiles} />
      <p className="asset-help">
        Drag an asset onto an SVG image slot in the canvas. Imported files are copied into the figure&apos;s local <code>assets/</code> folder.
      </p>

      <div className="asset-group">
        <h3>Local Assets</h3>
        {props.activeAssets?.local.length ? (
          <AssetList items={props.activeAssets.local} prefix="local" />
        ) : (
          <p className="empty-copy">No local assets yet.</p>
        )}
      </div>

      {props.activeAssets?.bookmarks.map((bookmark) => (
        <div className="asset-group" key={bookmark.alias}>
          <h3>{bookmark.alias}</h3>
          {bookmark.items.length ? (
            <AssetList items={bookmark.items} prefix={bookmark.alias} />
          ) : (
            <p className="empty-copy">No images found in {bookmark.path}.</p>
          )}
        </div>
      ))}
    </div>
  );
}
