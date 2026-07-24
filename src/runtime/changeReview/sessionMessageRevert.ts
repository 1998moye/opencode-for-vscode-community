import type { ChangeLedgerEntry } from "../contracts.js";
import { extractReadToolFileContent } from "../../backend/gateway/sessionChangeLedgerInfer.js";
import { computeFileRevertPlan } from "./threeWayFileRevert.js";

export interface LedgerDiskSnapshot {
  exists: boolean;
  content: string;
}

/**
 * 判断当前审查列表是否可由同一条 OpenCode 消息 revert 安全撤销（磁盘未在 Agent 完成后被用户改写）。
 *
 * @returns 共用的 messageId；不满足条件时返回 undefined。
 */
export async function assessSessionMessageRevertTarget(
  entries: ChangeLedgerEntry[],
  readFile: (filePath: string) => Promise<LedgerDiskSnapshot>
): Promise<string | undefined> {
  if (entries.length === 0) {
    return undefined;
  }
  const messageId = entries[0]?.messageId;
  if (!messageId) {
    return undefined;
  }
  if (entries.some((entry) => entry.revertibility !== "full" || entry.messageId !== messageId)) {
    return undefined;
  }
  for (const entry of entries) {
    const agentBefore = entry.agentBefore === undefined ? undefined : extractReadToolFileContent(entry.agentBefore);
    const disk = await readFile(entry.filePath);
    const plan = computeFileRevertPlan({
      before: agentBefore ?? "",
      after: entry.agentAfter ?? "",
      current: disk.content,
      fileExists: disk.exists,
      changeStatus: entry.status
    });
    if (plan.kind === "conflict") {
      return undefined;
    }
  }
  return messageId;
}

/**
 * @param entries - 变更账本
 * @param messageIds - 助手消息 id（合并时间线内可能多条）
 */
export function filterLedgerEntriesByMessageIds(
  entries: ChangeLedgerEntry[],
  messageIds: string[]
): ChangeLedgerEntry[] {
  const ids = new Set(messageIds);
  return entries.filter((entry) => entry.messageId !== undefined && ids.has(entry.messageId));
}

/**
 * 检查账本上 Agent 变更是否已在磁盘撤销（用于 OpenCode 消息 revert 后的校验）。
 */
export async function isLedgerUndoneOnDisk(
  entries: ChangeLedgerEntry[],
  readFile: (filePath: string) => Promise<LedgerDiskSnapshot>
): Promise<boolean> {
  for (const entry of entries) {
    if (entry.revertibility !== "full") {
      continue;
    }
    const agentBefore = entry.agentBefore === undefined ? undefined : extractReadToolFileContent(entry.agentBefore);
    const disk = await readFile(entry.filePath);
    const plan = computeFileRevertPlan({
      before: agentBefore ?? "",
      after: entry.agentAfter ?? "",
      current: disk.content,
      fileExists: disk.exists,
      changeStatus: entry.status
    });
    if (plan.kind === "revert" || plan.kind === "delete" || plan.kind === "conflict") {
      return false;
    }
  }
  return true;
}
