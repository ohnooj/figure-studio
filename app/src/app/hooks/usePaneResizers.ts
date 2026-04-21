import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

import {
  MIN_ASSET_HEIGHT,
  MIN_BOTTOM_HEIGHT,
  MIN_CODEX_MARKS_HEIGHT,
  MIN_LEFT_WIDTH,
  MIN_OBJECT_HEIGHT,
  MIN_PAYLOAD_HEIGHT,
  MIN_RIGHT_WIDTH,
} from "../constants";
import { clamp } from "../../shared/lib/utils";

export function usePaneResizers(config: {
  previewRef: RefObject<HTMLDivElement | null>;
  leftBottomSectionsRef: RefObject<HTMLDivElement | null>;
  codexBottomSectionsRef: RefObject<HTMLDivElement | null>;
  setLeftWidth: React.Dispatch<React.SetStateAction<number>>;
  setRightWidth: React.Dispatch<React.SetStateAction<number>>;
  setObjectSectionHeight: React.Dispatch<React.SetStateAction<number>>;
  setCodexMarksHeight: React.Dispatch<React.SetStateAction<number>>;
  setBottomPanelHeight: React.Dispatch<React.SetStateAction<number>>;
}) {
  function startOuterResize(side: "left" | "right", event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const root = config.previewRef.current?.closest(".studio-layout");
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const onMove = (moveEvent: MouseEvent): void => {
      if (side === "left") {
        config.setLeftWidth(clamp(moveEvent.clientX - rect.left, MIN_LEFT_WIDTH, rect.width - MIN_RIGHT_WIDTH - 320));
      } else {
        window.localStorage.setItem("paper_figures.rightWidthMode", "custom");
        config.setRightWidth(clamp(rect.right - moveEvent.clientX, MIN_RIGHT_WIDTH, rect.width - MIN_LEFT_WIDTH - 320));
      }
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startObjectResize(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    window.localStorage.setItem("paper_figures.objectHeightMode", "custom");
    const container = event.currentTarget.closest(".left-bottom-sections");
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const onMove = (moveEvent: MouseEvent): void => {
      config.setObjectSectionHeight(clamp(moveEvent.clientY - rect.top, MIN_OBJECT_HEIGHT, rect.height - MIN_ASSET_HEIGHT));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startBottomResize(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const container = event.currentTarget.closest(".center-pane");
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const splitterRect = event.currentTarget.getBoundingClientRect();
    const pointerOffset = event.clientY - splitterRect.top;
    const onMove = (moveEvent: MouseEvent): void => {
      const splitterTop = moveEvent.clientY - pointerOffset;
      const nextHeight = rect.bottom - splitterTop;
      config.setBottomPanelHeight(clamp(nextHeight, MIN_BOTTOM_HEIGHT, rect.height - 220));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startCodexMarksResize(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    window.localStorage.setItem("paper_figures.codexMarksHeightMode", "custom");
    const container = event.currentTarget.closest(".codex-bottom-sections");
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const onMove = (moveEvent: MouseEvent): void => {
      config.setCodexMarksHeight(clamp(moveEvent.clientY - rect.top, MIN_CODEX_MARKS_HEIGHT, rect.height - MIN_PAYLOAD_HEIGHT));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return {
    startOuterResize,
    startObjectResize,
    startCodexMarksResize,
    startBottomResize,
  };
}
