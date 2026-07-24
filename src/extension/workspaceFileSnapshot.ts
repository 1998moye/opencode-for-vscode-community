import * as path from "node:path";
import * as vscode from "vscode";
import type { WorkspaceFileSnapshot } from "./changeReviewActions.js";

/**
 * 以磁盘为准读取工作区文件（不用已打开编辑器缓冲，避免删除后仍判为存在）。
 */
export async function readWorkspaceFileSnapshot(filePath: string): Promise<WorkspaceFileSnapshot> {
  const uri = vscode.Uri.file(filePath);
  try {
    await vscode.workspace.fs.stat(uri);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return { exists: true, content: Buffer.from(bytes).toString("utf8") };
  } catch {
    return { exists: false, content: "" };
  }
}

/**
 * 写入文本并确保父目录存在。
 */
export async function writeWorkspaceFileText(filePath: string, content: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const parent = path.dirname(filePath);
  if (parent && parent !== "." && parent !== filePath) {
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(parent));
    } catch {
      // 目录已存在等可忽略
    }
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"), { create: true, overwrite: true });
}

/**
 * @param filePath - 绝对或工作区路径
 */
export async function deleteWorkspaceFile(filePath: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  await vscode.workspace.fs.delete(uri, { useTrash: true });
}
