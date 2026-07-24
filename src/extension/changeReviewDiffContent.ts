import * as vscode from "vscode";

const SCHEME = "opencode-change-review";
const contents = new Map<string, string>();

/**
 * 注册只读差异内容提供方，避免 untitled 文档关闭时提示保存。
 */
export function registerChangeReviewDiffProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
      provideTextDocumentContent(uri: vscode.Uri): string {
        return contents.get(uri.toString()) ?? "";
      }
    })
  );
}

/**
 * 创建并缓存只读差异侧 URI。
 */
export function createReadonlyDiffUri(filePath: string, side: "before" | "after" | "current" | "summary"): vscode.Uri {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? "file";
  return vscode.Uri.parse(`${SCHEME}:${base}?${side}=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

/**
 * 写入只读差异文档内容。
 */
export function setReadonlyDiffContent(uri: vscode.Uri, content: string): void {
  contents.set(uri.toString(), content);
}

/**
 * @param languageId - 差异侧语法高亮
 */
export async function openReadonlyDiff(
  title: string,
  leftLabel: string,
  leftContent: string,
  rightLabel: string,
  rightContent: string,
  languageId: string
): Promise<void> {
  const leftUri = createReadonlyDiffUri(title, "before");
  const rightUri = createReadonlyDiffUri(title, "after");
  setReadonlyDiffContent(leftUri, leftContent);
  setReadonlyDiffContent(rightUri, rightContent);
  await vscode.workspace.openTextDocument(leftUri);
  await vscode.workspace.openTextDocument(rightUri);
  await vscode.commands.executeCommand(
    "vscode.diff",
    leftUri,
    rightUri,
    `${title} (${leftLabel} ↔ ${rightLabel})`,
    { preview: true }
  );
}
