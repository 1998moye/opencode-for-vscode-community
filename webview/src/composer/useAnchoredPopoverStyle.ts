import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * 根据锚点计算浮层 fixed 坐标，避免被 overflow 容器裁切。
 */
export function useAnchoredPopoverStyle(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  align: "left" | "right"
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }

    const update = (): void => {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const width = Math.min(300, window.innerWidth * 0.78);
      const left = align === "left" ? rect.left : Math.max(8, rect.right - width);
      const maxHeight = Math.max(160, rect.top - gap - 8);

      setStyle({
        position: "fixed",
        top: Math.max(8, rect.top - gap),
        left,
        width,
        maxHeight,
        transform: "translateY(-100%)",
        zIndex: 1000
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open, align]);

  return open ? style : undefined;
}
