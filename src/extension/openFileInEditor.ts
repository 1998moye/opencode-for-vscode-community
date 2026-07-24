import * as vscode from "vscode";

/**
 * 在 VS Code 主编辑区打开本地文件。
 */
export async function openFileInEditor(filePath: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`无法打开文件: ${filePath}（${detail}）`);
  }
}
