import * as vscode from "vscode";
import type { ContextItem, OpenCodeRuntime } from "../runtime/contracts.js";
import { buildAutoSelectionItem, startTerminalCapture } from "./terminalCapture.js";

/**
 * 处理 Webview 发起的上下文添加请求。
 */
export async function handleAddContextRequest(
  runtime: OpenCodeRuntime,
  kind: "current-file" | "files" | "folder" | "problems" | "git-diff" | "terminal" | "terminal-paste" | "attachments",
  trusted: boolean
): Promise<void> {
  if (!trusted) {
    void vscode.window.showWarningMessage("请先信任此工作区后再添加上下文。");
    return;
  }
  const editor = vscode.window.activeTextEditor;
  const item = await buildContextItem(kind, editor);
  if (item) {
    await runtime.dispatch({ type: "add-context-item", item });
  }
}

async function buildContextItem(
  kind: ContextItem["kind"] | "current-file",
  editor: vscode.TextEditor | undefined
): Promise<ContextItem | undefined> {
  const id = `${kind}-${Date.now()}`;
  switch (kind) {
    case "current-file": {
      if (!editor) {
        void vscode.window.showWarningMessage("没有活动编辑器。");
        return undefined;
      }
      const uri = editor.document.uri.toString();
      return {
        id,
        kind: "file",
        label: vscode.workspace.asRelativePath(editor.document.uri),
        detail: "当前文件",
        source: { type: "file", uri }
      };
    }
    case "files": {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false });
      if (!picked?.length) {
        return undefined;
      }
      return {
        id,
        kind: "files",
        label: `${picked.length} 个文件`,
        detail: picked.map((uri) => vscode.workspace.asRelativePath(uri)).join(", "),
        source: { type: "files", uris: picked.map((uri) => uri.toString()) }
      };
    }
    case "folder": {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFolders: true, canSelectFiles: false });
      const folder = picked?.[0];
      if (!folder) {
        return undefined;
      }
      return {
        id,
        kind: "folder",
        label: vscode.workspace.asRelativePath(folder),
        detail: "文件夹",
        source: { type: "folder", uri: folder.toString() }
      };
    }
    case "problems":
      return {
        id,
        kind: "problems",
        label: editor ? vscode.workspace.asRelativePath(editor.document.uri) : "工作区",
        detail: "问题诊断",
        source: { type: "problems", ...(editor ? { uri: editor.document.uri.toString() } : {}) }
      };
    case "git-diff":
      return {
        id,
        kind: "git-diff",
        label: editor ? vscode.workspace.asRelativePath(editor.document.uri) : "工作区",
        detail: "Git 差异",
        source: { type: "git-diff", ...(editor ? { uri: editor.document.uri.toString() } : {}) }
      };
    case "terminal": {
      const { captureId, limitation } = startTerminalCapture();
      return {
        id,
        kind: "terminal",
        label: "终端输出",
        detail: limitation ?? "开始监听后的输出",
        source: { type: "terminal", captureId }
      };
    }
    case "terminal-paste": {
      const text = await vscode.window.showInputBox({
        title: "粘贴终端文本",
        prompt: "仅会发送你粘贴的内容，不会读取既有终端历史。",
        ignoreFocusOut: true
      });
      if (!text?.trim()) {
        return undefined;
      }
      return {
        id,
        kind: "terminal-paste",
        label: "终端文本",
        detail: "用户粘贴",
        source: { type: "terminal-paste", text }
      };
    }
    default:
      return undefined;
  }
}

/**
 * 注册编辑器上下文相关命令。
 */
export function registerEditorContextCommands(
  runtime: OpenCodeRuntime,
  options: {
    trusted: boolean;
    openSidebar: () => void;
    newSession: () => Promise<void>;
    chooseDirectory: () => Promise<string | undefined>;
  }
): vscode.Disposable {
  const runPrompt = async (text: string, createNew: boolean): Promise<void> => {
    options.openSidebar();
    if (createNew) {
      const directory = await options.chooseDirectory();
      if (!directory) {
        return;
      }
      await runtime.dispatch({ type: "create-session", directory });
    }
    await runtime.dispatch({ type: "update-draft", draft: text });
    await runtime.dispatch({ type: "send-message", text });
  };

  return vscode.Disposable.from(
    vscode.commands.registerCommand("opencodeCommunity.addSelectionToChat", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showWarningMessage("请先选择代码。");
        return;
      }
      const item = buildAutoSelectionItem(editor);
      if (item) {
        await runtime.dispatch({ type: "add-context-item", item: { ...item, auto: false } });
      }
      options.openSidebar();
    }),
    vscode.commands.registerCommand("opencodeCommunity.askInNewSession", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showWarningMessage("请先选择代码。");
        return;
      }
      await runPrompt("请解释这段代码。", true);
    }),
    vscode.commands.registerCommand("opencodeCommunity.fixDiagnostics", async () => {
      await runPrompt("请修复当前文件中的问题诊断。", false);
    }),
    vscode.commands.registerCommand("opencodeCommunity.reviewSelection", async () => {
      await runPrompt("请审查当前选区并提出改进建议。", false);
    })
  );
}
