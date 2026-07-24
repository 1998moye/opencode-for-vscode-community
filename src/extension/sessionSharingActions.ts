import * as vscode from "vscode";
import type { OpenCodeRuntime, OpenCodeState } from "../runtime/contracts.js";

/**
 * 创建会话分享相关操作：二次确认、调用 Runtime、复制链接。
 */
export function createSessionSharingActions(
  runtime: OpenCodeRuntime,
  readState: () => OpenCodeState | undefined
) {
  return {
    async shareSession(sessionId: string): Promise<void> {
      const confirmation = await vscode.window.showWarningMessage(
        "分享后，提示词、回复、代码、附件和工具输出可能被公开访问。确定要分享此会话吗？",
        { modal: true },
        "分享会话"
      );
      if (confirmation === "分享会话") {
        await runtime.dispatch({ type: "share-session", sessionId });
      }
    },

    async unshareSession(sessionId: string): Promise<void> {
      const confirmation = await vscode.window.showWarningMessage(
        "取消分享后，现有分享链接将失效。确定要取消分享吗？",
        { modal: true },
        "取消分享"
      );
      if (confirmation === "取消分享") {
        await runtime.dispatch({ type: "unshare-session", sessionId });
      }
    },

    async copyShareLink(sessionId: string): Promise<void> {
      const session = readState()?.sessions.find((candidate) => candidate.id === sessionId);
      if (!session?.shareUrl) {
        void vscode.window.showWarningMessage("此会话尚未创建分享链接。");
        return;
      }
      await vscode.env.clipboard.writeText(session.shareUrl);
      void vscode.window.showInformationMessage("分享链接已复制到剪贴板。");
    }
  };
}
