import { useEffect, useRef } from "react";
import type * as React from "react";

import {
  DEFAULT_BOTTOM_HEIGHT,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_OBJECT_HEIGHT,
  DEFAULT_RIGHT_WIDTH,
  DEFAULT_RIGHT_WIDTH_RATIO,
  MIN_ASSET_HEIGHT,
  MIN_LEFT_WIDTH,
  MIN_OBJECT_HEIGHT,
  MIN_RIGHT_WIDTH,
} from "../constants";
import { clamp } from "../../shared/lib/utils";

export function useStudioPanels(config: {
  leftWidth: number;
  setLeftWidth: React.Dispatch<React.SetStateAction<number>>;
  rightWidth: number;
  setRightWidth: React.Dispatch<React.SetStateAction<number>>;
  objectSectionHeight: number;
  setObjectSectionHeight: React.Dispatch<React.SetStateAction<number>>;
  bottomPanelHeight: number;
  setBottomPanelHeight: React.Dispatch<React.SetStateAction<number>>;
  previewRef: React.RefObject<HTMLDivElement | null>;
  leftBottomSectionsRef: React.RefObject<HTMLDivElement | null>;
}) {
  const lastLeftWidthRef = useRef(config.leftWidth || DEFAULT_LEFT_WIDTH);
  const lastRightWidthRef = useRef(config.rightWidth || DEFAULT_RIGHT_WIDTH);
  const lastObjectHeightRef = useRef(config.objectSectionHeight || Math.max(DEFAULT_BOTTOM_HEIGHT, MIN_OBJECT_HEIGHT));
  const lastBottomHeightRef = useRef(config.bottomPanelHeight || DEFAULT_BOTTOM_HEIGHT);

  useEffect(() => {
    if (window.localStorage.getItem("paper_figures.objectHeightMode") === "custom") {
      return;
    }
    const container = config.leftBottomSectionsRef.current;
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const applyDefaultObjectHeight = (): void => {
      const maxHeight = Math.max(MIN_OBJECT_HEIGHT, container.clientHeight - MIN_ASSET_HEIGHT);
      const nextHeight = clamp(Math.round(container.clientHeight * 0.6), MIN_OBJECT_HEIGHT, maxHeight);
      config.setObjectSectionHeight(nextHeight);
    };

    applyDefaultObjectHeight();
    const observer = new ResizeObserver(() => {
      if (window.localStorage.getItem("paper_figures.objectHeightMode") !== "custom") {
        applyDefaultObjectHeight();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [config.leftBottomSectionsRef, config.setObjectSectionHeight]);

  useEffect(() => {
    if (window.localStorage.getItem("paper_figures.rightWidthMode") === "custom") {
      return;
    }
    const layout = config.previewRef.current?.closest(".studio-layout");
    if (!(layout instanceof HTMLElement)) {
      return;
    }

    const applyDefaultRightWidth = (): void => {
      const maxWidth = Math.max(MIN_RIGHT_WIDTH, layout.clientWidth - MIN_LEFT_WIDTH - 320);
      const nextWidth = clamp(Math.round(layout.clientWidth * DEFAULT_RIGHT_WIDTH_RATIO), MIN_RIGHT_WIDTH, maxWidth);
      config.setRightWidth(nextWidth);
    };

    applyDefaultRightWidth();
    const observer = new ResizeObserver(() => {
      if (window.localStorage.getItem("paper_figures.rightWidthMode") !== "custom") {
        applyDefaultRightWidth();
      }
    });
    observer.observe(layout);
    return () => observer.disconnect();
  }, [config.previewRef, config.setRightWidth]);

  useEffect(() => {
    if (config.leftWidth > 0) {
      lastLeftWidthRef.current = config.leftWidth;
    }
  }, [config.leftWidth]);

  useEffect(() => {
    if (config.rightWidth > 0) {
      lastRightWidthRef.current = config.rightWidth;
    }
  }, [config.rightWidth]);

  useEffect(() => {
    if (config.objectSectionHeight > 0) {
      lastObjectHeightRef.current = config.objectSectionHeight;
    }
  }, [config.objectSectionHeight]);

  useEffect(() => {
    if (config.bottomPanelHeight > 0) {
      lastBottomHeightRef.current = config.bottomPanelHeight;
    }
  }, [config.bottomPanelHeight]);

  function toggleLeftRail(): void {
    config.setLeftWidth((current) => {
      if (current <= 0) {
        return Math.max(lastLeftWidthRef.current || DEFAULT_LEFT_WIDTH, MIN_LEFT_WIDTH);
      }
      lastLeftWidthRef.current = current;
      return 0;
    });
  }

  function toggleRightRail(): void {
    config.setRightWidth((current) => {
      if (current <= 0) {
        return Math.max(lastRightWidthRef.current || DEFAULT_RIGHT_WIDTH, MIN_RIGHT_WIDTH);
      }
      lastRightWidthRef.current = current;
      return 0;
    });
  }

  function toggleObjectSection(): void {
    config.setObjectSectionHeight((current) => {
      if (current <= 0) {
        return Math.max(lastObjectHeightRef.current || Math.round(DEFAULT_OBJECT_HEIGHT), MIN_OBJECT_HEIGHT);
      }
      lastObjectHeightRef.current = current;
      return 0;
    });
  }

  function toggleBottomPanel(): void {
    config.setBottomPanelHeight((current) => {
      if (current <= 0) {
        return Math.max(lastBottomHeightRef.current || DEFAULT_BOTTOM_HEIGHT, DEFAULT_BOTTOM_HEIGHT);
      }
      lastBottomHeightRef.current = current;
      return 0;
    });
  }

  return {
    toggleLeftRail,
    toggleRightRail,
    toggleObjectSection,
    toggleBottomPanel,
  };
}
