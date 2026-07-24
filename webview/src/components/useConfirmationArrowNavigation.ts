import { useEffect, useRef, useState, type RefObject } from "react";

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export interface ConfirmationArrowNavigationOptions {
  /**
   * 焦点在 Composer 等外部输入框时，仍用方向键切换选项、Enter 确认当前项。
   */
  interceptFromOutside?: boolean;
}

/**
 * 列出容器内可键盘聚焦的子元素（跳过禁用项）。
 */
function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.closest("[hidden]"));
}

function isExternalTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    return type !== "button" && type !== "submit" && type !== "reset" && type !== "checkbox" && type !== "radio";
  }
  return false;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

/**
 * 确认类卡片：方向键在选项/按钮间移动焦点；Enter 触发当前选中按钮。
 */
export function useConfirmationArrowNavigation(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
  options: ConfirmationArrowNavigationOptions = {}
): { selectedIndex: number } {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const interceptFromOutside = options.interceptFromOutside ?? false;

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const root = containerRef.current;
    if (!root) {
      return;
    }

    const focusables = (): HTMLElement[] => listFocusable(root);

    const syncSelectedFromFocus = (): void => {
      const list = focusables();
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return;
      }
      const index = list.indexOf(active);
      if (index >= 0) {
        setSelectedIndex(index);
      }
    };

    const focusIndex = (index: number): void => {
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      const next = clampIndex(index, list.length);
      setSelectedIndex(next);
      list[next]!.focus();
    };

    const moveSelection = (step: number): void => {
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      const next = clampIndex(selectedIndexRef.current + step, list.length);
      focusIndex(next);
    };

    const activateSelected = (): void => {
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      list[clampIndex(selectedIndexRef.current, list.length)]!.click();
    };

    const handleArrowKey = (event: KeyboardEvent): boolean => {
      if (!ARROW_KEYS.has(event.key)) {
        return false;
      }
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      moveSelection(step);
      event.preventDefault();
      event.stopPropagation();
      return true;
    };

    const focusInitial = (): void => {
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      const active = document.activeElement;
      if (!active || !root.contains(active)) {
        setSelectedIndex(0);
        list[0]!.focus();
        return;
      }
      syncSelectedFromFocus();
    };
    const timer = window.setTimeout(focusInitial, 0);

    const onRootKeyDown = (event: KeyboardEvent): void => {
      if (!ARROW_KEYS.has(event.key) && event.key !== "Enter") {
        return;
      }
      if (event.isComposing) {
        return;
      }
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      if (ARROW_KEYS.has(event.key)) {
        handleArrowKey(event);
        return;
      }
      const target = event.target;
      if (target instanceof HTMLButtonElement && root.contains(target)) {
        return;
      }
      activateSelected();
      event.preventDefault();
      event.stopPropagation();
    };

    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (!interceptFromOutside) {
        return;
      }
      if (!ARROW_KEYS.has(event.key) && event.key !== "Enter") {
        return;
      }
      if (event.isComposing) {
        return;
      }
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      const target = event.target;
      const insideRoot = target instanceof Node && root.contains(target);
      if (insideRoot) {
        return;
      }
      if (!isExternalTextEntry(target)) {
        return;
      }
      if (ARROW_KEYS.has(event.key)) {
        handleArrowKey(event);
        return;
      }
      activateSelected();
      event.preventDefault();
      event.stopPropagation();
    };

    const onFocusIn = (): void => {
      syncSelectedFromFocus();
    };

    root.addEventListener("keydown", onRootKeyDown);
    root.addEventListener("focusin", onFocusIn);
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("keydown", onRootKeyDown);
      root.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };
  }, [containerRef, enabled, interceptFromOutside]);

  return { selectedIndex };
}
