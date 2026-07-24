import { createPortal } from "react-dom";
import { useAnchoredPopoverStyle } from "../composer/useAnchoredPopoverStyle";
import type { ReactNode, RefObject } from "react";

/**
 * 编写区底栏浮层：Portal 渲染，避免被输入框 overflow 裁切。
 */
export function ComposerPopover({
  anchorRef,
  panelRef,
  open,
  title,
  align = "left",
  children
}: {
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  title?: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const style = useAnchoredPopoverStyle(anchorRef, open, align);

  if (!open || !style) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className={`composer__popover composer__popover--${align} composer__popover--floating`}
      style={style}
      role="dialog"
      aria-label={title}
    >
      {title ? <div className="composer__popover-title">{title}</div> : null}
      {children}
    </div>,
    document.body
  );
}
