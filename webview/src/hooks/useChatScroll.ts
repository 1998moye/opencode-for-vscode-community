import { useCallback, useEffect, useRef, useState } from "react";

/** 距底部在此范围内时，新消息仍自动滚底。 */
const AUTO_SCROLL_THRESHOLD_PX = 120;
/** 只有明显离开底部超过此距离，才考虑显示回底按钮（迟滞大于自动滚底阈值，避免流式输出时闪烁）。 */
const SHOW_FAB_THRESHOLD_PX = 280;
/** 回底按钮延迟显示，过滤布局抖动与自动滚底过程中的瞬时偏离。 */
const SHOW_FAB_DELAY_MS = 220;

/**
 * 查找消息列表所在的滚动容器。
 */
function resolveScrollContainer(anchor: HTMLElement | null): HTMLElement | null {
  return anchor?.closest(".app-shell__body") as HTMLElement | null;
}

/**
 * 计算距底部的剩余滚动距离。
 */
function distanceFromBottom(container: HTMLElement): number {
  return container.scrollHeight - container.scrollTop - container.clientHeight;
}

/**
 * 判断滚动容器是否贴近底部。
 */
function isNearBottom(container: HTMLElement | null, threshold = AUTO_SCROLL_THRESHOLD_PX): boolean {
  if (!container) {
    return true;
  }
  return distanceFromBottom(container) <= threshold;
}

/**
 * 管理聊天区自动滚底与「回到底部」按钮显隐。
 */
export function useChatScroll(scrollKey: string, interactionKey = "") {
  const endRef = useRef<HTMLDivElement>(null);
  const showFabTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const prevInteractionKeyRef = useRef(interactionKey);
  const [showScrollFab, setShowScrollFab] = useState(false);

  const scrollContainerToEnd = useCallback((behavior: ScrollBehavior) => {
    const container = resolveScrollContainer(endRef.current);
    if (container) {
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: container.scrollHeight, behavior });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
    const scrollIntoView = endRef.current?.scrollIntoView;
    if (typeof scrollIntoView === "function") {
      scrollIntoView.call(endRef.current, { block: "end", behavior });
    }
  }, []);

  const updateScrollState = useCallback(() => {
    const container = resolveScrollContainer(endRef.current);
    if (!container) {
      setShowScrollFab(false);
      return;
    }
    const away = distanceFromBottom(container) > SHOW_FAB_THRESHOLD_PX;
    if (!away) {
      if (showFabTimerRef.current) {
        clearTimeout(showFabTimerRef.current);
        showFabTimerRef.current = undefined;
      }
      setShowScrollFab(false);
      return;
    }
    if (showFabTimerRef.current) {
      return;
    }
    showFabTimerRef.current = setTimeout(() => {
      showFabTimerRef.current = undefined;
      const current = resolveScrollContainer(endRef.current);
      if (!current) {
        return;
      }
      setShowScrollFab(distanceFromBottom(current) > SHOW_FAB_THRESHOLD_PX);
    }, SHOW_FAB_DELAY_MS);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (showFabTimerRef.current) {
      clearTimeout(showFabTimerRef.current);
      showFabTimerRef.current = undefined;
    }
    setShowScrollFab(false);
    scrollContainerToEnd(behavior);
    requestAnimationFrame(() => {
      updateScrollState();
    });
  }, [scrollContainerToEnd, updateScrollState]);

  useEffect(() => {
    const container = resolveScrollContainer(endRef.current);
    if (!container) {
      return;
    }
    const onScroll = (): void => {
      updateScrollState();
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    updateScrollState();
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (showFabTimerRef.current) {
        clearTimeout(showFabTimerRef.current);
        showFabTimerRef.current = undefined;
      }
    };
  }, [updateScrollState, scrollKey]);

  useEffect(() => {
    const interactionChanged = interactionKey !== prevInteractionKeyRef.current;
    prevInteractionKeyRef.current = interactionKey;
    const forceForInteraction = interactionKey.length > 0 && interactionChanged;

    const container = resolveScrollContainer(endRef.current);
    const pinned = isNearBottom(container);
    if (pinned || forceForInteraction) {
      if (showFabTimerRef.current) {
        clearTimeout(showFabTimerRef.current);
        showFabTimerRef.current = undefined;
      }
      setShowScrollFab(false);
      const behavior: ScrollBehavior = forceForInteraction ? "smooth" : "auto";
      scrollContainerToEnd(behavior);
      if (forceForInteraction) {
        requestAnimationFrame(() => {
          scrollContainerToEnd("auto");
        });
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateScrollState();
      });
    });
  }, [scrollKey, interactionKey, scrollContainerToEnd, updateScrollState]);

  return { endRef, showScrollFab, scrollToBottom };
}
