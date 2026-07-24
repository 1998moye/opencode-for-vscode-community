import type { ChangeLedgerEntry, ChangeReviewDismissAnchor } from "../contracts.js";

/**
 * @param filePath - 账本中的路径
 */
export function normalizeReviewPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

/**
 * 从账本项生成「已保留」锚点，用于刷新时只隐藏同一次 Agent 变更。
 */
export function anchorFromLedgerEntry(entry: ChangeLedgerEntry): ChangeReviewDismissAnchor {
  return {
    filePath: entry.filePath,
    status: entry.status,
    ...(entry.messageId ? { messageId: entry.messageId } : {}),
    ...(entry.agentAfter !== undefined ? { agentAfter: entry.agentAfter } : {})
  };
}

/**
 * 是否仍应因用户点过「保留」而隐藏该项（新一轮改动应重新出现）。
 */
export function shouldHideDismissedEntry(
  entry: ChangeLedgerEntry,
  anchor: ChangeReviewDismissAnchor
): boolean {
  if (normalizeReviewPath(anchor.filePath) !== normalizeReviewPath(entry.filePath)) {
    return false;
  }
  if (anchor.messageId && entry.messageId && anchor.messageId !== entry.messageId) {
    return false;
  }
  if (anchor.agentAfter !== undefined && entry.agentAfter !== undefined && anchor.agentAfter !== entry.agentAfter) {
    return false;
  }
  if (entry.status !== anchor.status) {
    return false;
  }
  return true;
}

/**
 * @param entry - 服务端重建的账本项
 * @param anchors - 本会话已保留锚点
 */
export function isEntryDismissedByAnchors(
  entry: ChangeLedgerEntry,
  anchors: ChangeReviewDismissAnchor[]
): boolean {
  return anchors.some((anchor) => shouldHideDismissedEntry(entry, anchor));
}

/**
 * 同路径只保留最新一次「保留」锚点。
 */
export function upsertDismissAnchorForPath(
  anchors: ChangeReviewDismissAnchor[],
  next: ChangeReviewDismissAnchor
): ChangeReviewDismissAnchor[] {
  const key = normalizeReviewPath(next.filePath);
  return [...anchors.filter((anchor) => normalizeReviewPath(anchor.filePath) !== key), next];
}
