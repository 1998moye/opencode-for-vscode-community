import * as vscode from "vscode";
import type { RuntimeNotice } from "../runtime/contracts.js";

export interface RuntimeNoticeContext {
  activeSessionId?: string | undefined;
}

/**
 * 展示运行时通知。当前正在查看的会话完成时不弹「后台任务已完成」。
 */
export function showRuntimeNotice(notice: RuntimeNotice, context: RuntimeNoticeContext = {}): void {
  switch (notice.type) {
    case "permission-required":
      if (notice.sessionId === context.activeSessionId) {
        return;
      }
      void vscode.window.showWarningMessage("OpenCode 有一个会话正在等待授权，请打开插件处理。");
      break;
    case "session-completed":
      if (notice.sessionId === context.activeSessionId) {
        return;
      }
      void vscode.window.showInformationMessage("OpenCode 后台任务已完成。");
      break;
    case "session-failed":
      if (notice.sessionId === context.activeSessionId) {
        return;
      }
      void vscode.window.showErrorMessage("OpenCode 后台任务失败，请打开插件查看状态。");
      break;
  }
}
