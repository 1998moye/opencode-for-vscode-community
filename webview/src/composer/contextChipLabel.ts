import type { ContextItem } from "../../../src/runtime/contracts";

/**
 * 上下文芯片展示名：仅保留文件名，不显示完整路径。
 */
export function formatContextChipLabel(item: ContextItem): string {
  const normalized = item.label.replace(/\\/g, "/");
  if (!normalized.includes("/")) {
    return item.label;
  }
  const segments = normalized.split("/");
  return segments[segments.length - 1] || item.label;
}

/**
 * 是否在芯片上展示类型标签。
 */
export function shouldShowContextKind(item: ContextItem): boolean {
  return item.kind !== "image" && item.kind !== "pdf" && item.kind !== "file";
}
