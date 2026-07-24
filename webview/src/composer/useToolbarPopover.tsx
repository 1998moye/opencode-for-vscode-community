import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToolbarPopoverId = "agent" | "model";

interface ToolbarPopoverContextValue {
  openId: ToolbarPopoverId | null;
  toggle: (id: ToolbarPopoverId) => void;
  close: () => void;
  isOpen: (id: ToolbarPopoverId) => boolean;
}

const ToolbarPopoverContext = createContext<ToolbarPopoverContextValue | null>(null);

/**
 * 底栏弹层互斥：同一时刻只展开一个菜单。
 */
export function ToolbarPopoverProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<ToolbarPopoverId | null>(null);

  const toggle = useCallback((id: ToolbarPopoverId) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
  }, []);

  const isOpen = useCallback((id: ToolbarPopoverId) => openId === id, [openId]);

  const value = useMemo(
    () => ({ openId, toggle, close, isOpen }),
    [openId, toggle, close, isOpen]
  );

  return (
    <ToolbarPopoverContext.Provider value={value}>
      {children}
    </ToolbarPopoverContext.Provider>
  );
}

/**
 * 绑定底栏某一弹层：互斥开关 + 点击外部关闭。
 */
export function useToolbarPopover(id: ToolbarPopoverId) {
  const context = useContext(ToolbarPopoverContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = context?.isOpen(id) ?? false;

  useEffect(() => {
    if (!open || !context) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      context.close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, context]);

  return {
    rootRef,
    panelRef,
    open,
    toggle: () => context?.toggle(id),
    close: () => context?.close()
  };
}
