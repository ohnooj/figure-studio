import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from "react";

import { useScrollShadowState } from "../../shared/hooks/useScrollShadowState";
import type { ObjectNode } from "../../shared/types/editor";
import { CODEX_PROMPT_REFERENCE_MIME, referenceChipId, serializePromptReferenceToken, type PromptReferenceToken } from "../codex/promptTokens";

function kindIcon(kind: ObjectNode["kind"]): string {
  switch (kind) {
    case "panel":
      return "▣";
    case "slot":
      return "◫";
    case "text":
      return "T";
    case "group":
      return "▾";
    default:
      return "◌";
  }
}

export function ObjectTreeView(props: {
  nodes: ObjectNode[];
  activeIds: string[];
  linkedIds?: string[];
  hoveredId?: string;
  dropTarget: string;
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  onHover?: (id: string) => void;
  onSelect: (id: string, options?: { additive?: boolean; toggle?: boolean; rangeIds?: string[] }) => void;
  onRename: (id: string, label: string) => void;
  onDragStart: (id: string) => void;
  onDragEnterTarget: (id: string) => void;
  onDropRoot: () => void;
  onDropTarget: (id: string) => void;
  onDragEnd: () => void;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const selectionAnchorIdRef = useRef("");
  const { canScrollStart, canScrollEnd } = useScrollShadowState(scrollRef, "vertical", [props.nodes.length, props.activeIds.join("|")]);

  useEffect(() => {
    const activeBranchIds = new Set<string>();

    function visit(node: ObjectNode, ancestors: string[]): void {
      const nextAncestors = [...ancestors, node.id];
      if (props.activeIds.includes(node.id)) {
        ancestors.forEach((ancestorId) => activeBranchIds.add(ancestorId));
      }
      node.children.forEach((child) => visit(child, nextAncestors));
    }

    props.nodes.forEach((node) => visit(node, []));
    if (!activeBranchIds.size) {
      return;
    }
    setCollapsedIds((current) => {
      const next = new Set(current);
      let changed = false;
      activeBranchIds.forEach((nodeId) => {
        if (next.delete(nodeId)) {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [props.activeIds, props.nodes]);

  function toggleCollapsed(nodeId: string): void {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function flattenVisibleIds(nodes: ObjectNode[]): string[] {
    const ids: string[] = [];
    const visit = (node: ObjectNode): void => {
      ids.push(node.id);
      if (!collapsedIds.has(node.id)) {
        node.children.forEach(visit);
      }
    };
    nodes.forEach(visit);
    return ids;
  }

  function handleSelect(id: string, event: ReactMouseEvent<HTMLButtonElement>): void {
    const visibleIds = flattenVisibleIds(props.nodes);
    const anchorId = selectionAnchorIdRef.current || props.activeIds[props.activeIds.length - 1] || id;
    const shiftPressed = event.shiftKey;
    const togglePressed = event.metaKey || event.ctrlKey;
    if (shiftPressed) {
      const anchorIndex = visibleIds.indexOf(anchorId);
      const targetIndex = visibleIds.indexOf(id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [startIndex, endIndex] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        props.onSelect(id, {
          additive: togglePressed,
          rangeIds: visibleIds.slice(startIndex, endIndex + 1),
        });
      } else {
        props.onSelect(id, { additive: togglePressed });
      }
    } else if (togglePressed) {
      props.onSelect(id, { toggle: true });
    } else {
      props.onSelect(id);
    }
    selectionAnchorIdRef.current = id;
  }

  return (
    <div className={["scroll-shadow-frame", "scroll-shadow-vertical", canScrollStart ? "can-scroll-start" : "", canScrollEnd ? "can-scroll-end" : ""].filter(Boolean).join(" ")}>
      <div className="object-tree" ref={(node) => {
        scrollRef.current = node;
        if (props.containerRef) {
          props.containerRef.current = node;
        }
      }}>
        <div
          className={props.dropTarget === "__canvas__" ? "tree-root drop-target" : "tree-root"}
          onDragEnter={() => props.onDragEnterTarget("__canvas__")}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            props.onDropRoot();
          }}
        >
          Canvas
        </div>
        {props.nodes.map((node) => (
          <ObjectTreeNode
            key={node.id}
            node={node}
            activeIds={props.activeIds}
            linkedIds={props.linkedIds ?? []}
            hoveredId={props.hoveredId ?? ""}
            dropTarget={props.dropTarget}
            onHover={props.onHover}
            onSelect={handleSelect}
            onRename={props.onRename}
            onDragStart={props.onDragStart}
            onDragEnterTarget={props.onDragEnterTarget}
            onDropTarget={props.onDropTarget}
            onDragEnd={props.onDragEnd}
            depth={0}
            isCollapsed={(nodeId) => collapsedIds.has(nodeId)}
            onToggleCollapsed={toggleCollapsed}
          />
        ))}
      </div>
    </div>
  );
}

function ObjectTreeNode(props: {
  node: ObjectNode;
  activeIds: string[];
  linkedIds: string[];
  hoveredId: string;
  dropTarget: string;
  onHover?: (id: string) => void;
  onSelect: (id: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onRename: (id: string, label: string) => void;
  onDragStart: (id: string) => void;
  onDragEnterTarget: (id: string) => void;
  onDropTarget: (id: string) => void;
  onDragEnd: () => void;
  depth: number;
  isCollapsed: (id: string) => boolean;
  onToggleCollapsed: (id: string) => void;
}) {
  const {
    node,
    activeIds,
    linkedIds,
    hoveredId,
    dropTarget,
    onHover,
    onSelect,
    onRename,
    onDragStart,
    onDragEnterTarget,
    onDropTarget,
    onDragEnd,
    depth,
    isCollapsed,
    onToggleCollapsed,
  } = props;
  const hasChildren = node.children.length > 0;
  const collapsed = isCollapsed(node.id);
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(node.label);

  useEffect(() => {
    if (!editing) {
      setDraftLabel(node.label);
    }
  }, [node.label, editing]);

  function commitRename(): void {
    const nextLabel = draftLabel.trim();
    setEditing(false);
    if (nextLabel && nextLabel !== node.label) {
      onRename(node.id, nextLabel);
    } else {
      setDraftLabel(node.label);
    }
  }

  return (
    <div className="tree-item">
      <div className="tree-row" style={{ paddingLeft: `${depth * 0.95}rem` }}>
        <button
          className={hasChildren ? "tree-toggle" : "tree-toggle placeholder"}
          onClick={() => {
            if (hasChildren) {
              onToggleCollapsed(node.id);
            }
          }}
          aria-label={collapsed ? "Expand node" : "Collapse node"}
        >
          {hasChildren ? (collapsed ? "▸" : "▾") : ""}
        </button>
        <button
          className={[
            "tree-node",
            `depth-tone-${depth % 6}`,
            activeIds.includes(node.id) ? "active" : "",
            linkedIds.includes(node.id) ? "linked" : "",
            hoveredId === node.id ? "hovered" : "",
            dropTarget === node.id ? "drop-target" : "",
          ].join(" ")}
          data-reference-chip-id={referenceChipId({ kind: "object", id: node.id, label: node.label, objectKind: node.kind })}
          onClick={(event) => onSelect(node.id, event)}
          onMouseEnter={() => onHover?.(node.id)}
          onMouseLeave={() => onHover?.("")}
          onDoubleClick={() => setEditing(true)}
          draggable
          onDragStart={(event) => {
            const token: PromptReferenceToken = {
              kind: "object",
              id: node.id,
              label: node.label,
              objectKind: node.kind,
            };
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setData(CODEX_PROMPT_REFERENCE_MIME, JSON.stringify(token));
            event.dataTransfer.setData("text/plain", serializePromptReferenceToken(token));
            onDragStart(node.id);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={() => onDragEnterTarget(node.id)}
          onDrop={(event) => {
            event.preventDefault();
            onDropTarget(node.id);
          }}
        >
          <span className={`tree-kind tree-kind-${node.kind}`} aria-hidden="true">{kindIcon(node.kind)}</span>
          {editing ? (
            <input
              className="tree-label-input"
              value={draftLabel}
              autoFocus
              onChange={(event) => setDraftLabel(event.target.value)}
              onBlur={commitRename}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditing(false);
                  setDraftLabel(node.label);
                }
              }}
            />
          ) : (
            <span className="tree-label">{node.label}</span>
          )}
        </button>
      </div>
      {hasChildren && !collapsed ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <ObjectTreeNode
              key={child.id}
              node={child}
              activeIds={activeIds}
              linkedIds={linkedIds}
              hoveredId={hoveredId}
              dropTarget={dropTarget}
              onHover={onHover}
              onSelect={onSelect}
              onRename={onRename}
              onDragStart={onDragStart}
              onDragEnterTarget={onDragEnterTarget}
              onDropTarget={onDropTarget}
              onDragEnd={onDragEnd}
              depth={depth + 1}
              isCollapsed={isCollapsed}
              onToggleCollapsed={onToggleCollapsed}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
