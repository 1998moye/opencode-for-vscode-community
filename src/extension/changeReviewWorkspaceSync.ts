import * as vscode from "vscode";
import type { OpenCodeRuntime } from "../runtime/contracts.js";

const DEBOUNCE_MS = 750;

/**
 * 工作区文件变更时防抖刷新当前会话变更账本（外部编辑后列表与统计保持同步）。
 */
export function subscribeChangeReviewWorkspaceSync(
  runtime: OpenCodeRuntime,
  getReviewEntryCount: () => number
): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (getReviewEntryCount() === 0) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (getReviewEntryCount() > 0) {
        void runtime.dispatch({ type: "refresh-change-review" });
      }
    }, DEBOUNCE_MS);
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  watcher.onDidChange(schedule);
  watcher.onDidCreate(schedule);
  watcher.onDidDelete(schedule);

  return {
    dispose: () => {
      watcher.dispose();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };
}
