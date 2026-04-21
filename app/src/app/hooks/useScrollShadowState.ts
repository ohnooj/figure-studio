import { useEffect, useState, type RefObject } from "react";

export function useScrollShadowState(
  scrollRef: RefObject<HTMLElement | null>,
  orientation: "horizontal" | "vertical",
  deps: ReadonlyArray<unknown> = [],
) {
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!(scroller instanceof HTMLElement)) {
      return;
    }

    const syncScrollState = (): void => {
      if (orientation === "horizontal") {
        const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        setCanScrollStart(scroller.scrollLeft > 2);
        setCanScrollEnd(scroller.scrollLeft < maxScroll - 2);
        return;
      }
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      setCanScrollStart(scroller.scrollTop > 2);
      setCanScrollEnd(scroller.scrollTop < maxScroll - 2);
    };

    syncScrollState();
    scroller.addEventListener("scroll", syncScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(syncScrollState);
    resizeObserver.observe(scroller);
    const inner = scroller.firstElementChild;
    if (inner instanceof HTMLElement) {
      resizeObserver.observe(inner);
    }
    window.addEventListener("resize", syncScrollState);
    return () => {
      scroller.removeEventListener("scroll", syncScrollState);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncScrollState);
    };
  }, [scrollRef, orientation, ...deps]);

  return { canScrollStart, canScrollEnd };
}
