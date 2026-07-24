import * as vscode from "vscode";

export function currentWorkspaceDirectory(): string | undefined {
  const editorUri = vscode.window.activeTextEditor?.document.uri;
  const editorFolder = editorUri ? vscode.workspace.getWorkspaceFolder(editorUri) : undefined;
  return editorFolder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function chooseSessionDirectory(): Promise<string | undefined> {
  const current = currentWorkspaceDirectory();
  if (current) {
    return current;
  }
  const selected = await vscode.window.showOpenDialog({
    title: "选择新会话的工作目录",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "在此目录创建会话"
  });
  return selected?.[0]?.fsPath;
}
