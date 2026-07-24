import * as vscode from "vscode";
import type { ChangeLedgerEntry, OpenCodeRuntime } from "../runtime/contracts.js";
import { assessSessionMessageRevertTarget, isLedgerUndoneOnDisk } from "../runtime/changeReview/sessionMessageRevert.js";
import {
  revertAllChangeFilesOnDisk,
  type RevertAllChangeFilesResult
} from "./changeReviewActions.js";

/**
 * @param result - 批量回退结果
 */
export function summarizeRevertBatchResult(result: RevertAllChangeFilesResult): string {
  const parts = [
    result.reverted > 0 ? `已回退 ${result.reverted} 个` : "",
    result.deleted > 0 ? `删除新建 ${result.deleted} 个` : "",
    result.noop > 0 ? `无需变更 ${result.noop} 个` : "",
    result.skippedReadonly > 0 ? `跳过只读 ${result.skippedReadonly} 个` : "",
    result.conflicts.length > 0 ? `冲突 ${result.conflicts.length} 个（已打开对比）` : "",
    result.failures.length > 0 ? `失败 ${result.failures.length} 个` : ""
  ].filter(Boolean);
  return parts.join("；") || "回退已完成。";
}

export interface LedgerRevertBatchOptions {
  readFile: (filePath: string) => Promise<{ exists: boolean; content: string }>;
  writeText: (filePath: string, content: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  progressTitle: string;
  tryMessageRevert: boolean;
  /** 消息级 revert 成功后是否从审查列表移除对应项（默认 true）。 */
  dismissEntriesOnSuccess?: boolean;
}

/**
 * 对给定账本子集执行安全回退：优先 OpenCode 消息 revert，否则逐文件三方合并。
 */
export async function executeLedgerRevertBatch(
  runtime: OpenCodeRuntime,
  entries: ChangeLedgerEntry[],
  options: LedgerRevertBatchOptions
): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const revertable = entries.filter((entry) => entry.revertibility === "full");
  if (revertable.length === 0) {
    void vscode.window.showWarningMessage("相关文件均不支持自动回退，仅可查看差异。");
    return;
  }

  if (options.tryMessageRevert) {
    const messageRevertId = await assessSessionMessageRevertTarget(entries, options.readFile);
    if (messageRevertId) {
      try {
        const reverted = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "正在通过 OpenCode 撤销消息…" },
          async () => runtime.revertSessionMessage(messageRevertId)
        );
        if (reverted) {
          const applied = await isLedgerUndoneOnDisk(entries, options.readFile);
          if (!applied) {
            void vscode.window.showWarningMessage(
              "OpenCode 已撤销消息，但工作区文件未同步回退，将改为逐文件写盘。"
            );
          } else {
            if (options.dismissEntriesOnSuccess !== false) {
              for (const entry of entries) {
                await runtime.dispatch({ type: "dismiss-change-review-entry", filePath: entry.filePath });
              }
            }
            void vscode.window.showInformationMessage("已通过 OpenCode 撤销对应消息并刷新会话与变更列表。");
            return;
          }
        }
      } catch (error) {
        void vscode.window.showWarningMessage(
          error instanceof Error ? error.message : "OpenCode 消息撤销失败，将改为逐文件回退。"
        );
      }
    }
  }

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: options.progressTitle },
    async () => revertAllChangeFilesOnDisk(
      entries,
      options.readFile,
      options.writeText,
      options.deleteFile
    )
  );

  if (options.dismissEntriesOnSuccess !== false) {
    for (const entry of entries) {
      if (entry.revertibility !== "full") {
        continue;
      }
      const conflict = result.conflicts.some((item) => item.filePath === entry.filePath);
      const failure = result.failures.some((item) => item.filePath === entry.filePath);
      if (!conflict && !failure) {
        await runtime.dispatch({ type: "dismiss-change-review-entry", filePath: entry.filePath });
      }
    }
  }
  void vscode.window.showInformationMessage(summarizeRevertBatchResult(result));
}
