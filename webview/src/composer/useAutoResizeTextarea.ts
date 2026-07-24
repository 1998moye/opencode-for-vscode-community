import { useLayoutEffect, useRef, type RefObject } from "react";
import { COMPOSER_INPUT_MAX_HEIGHT, COMPOSER_INPUT_MIN_HEIGHT } from "./constants";

/**
 * 同步 textarea 高度：随内容增高，达到上限后在输入框内滚动。
 */
function syncTextareaHeight(
  element: HTMLTextAreaElement,
  minHeight: number,
  maxHeight: number
): void {
  element.style.height = `${minHeight}px`;
  const contentHeight = element.scrollHeight;
  const nextHeight = Math.max(minHeight, Math.min(contentHeight, maxHeight));
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

/**
 * 让 textarea 随内容增高，达到上限后出现滚动条。
 */
export function useAutoResizeTextarea(
  value: string,
  options: { minHeight?: number; maxHeight?: number } = {}
): RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement>(null);
  const minHeight = options.minHeight ?? COMPOSER_INPUT_MIN_HEIGHT;
  const maxHeight = options.maxHeight ?? COMPOSER_INPUT_MAX_HEIGHT;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    syncTextareaHeight(element, minHeight, maxHeight);
  }, [value, minHeight, maxHeight]);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = element?.parentElement;
    if (!element || !container || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      syncTextareaHeight(element, minHeight, maxHeight);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [minHeight, maxHeight]);

  return ref;
}
