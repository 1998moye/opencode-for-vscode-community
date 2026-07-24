import * as vscode from "vscode";
import { formatByteSize, MAX_ATTACHMENT_BYTES, MAX_CONTEXT_ITEM_BYTES, MAX_TOTAL_ATTACHMENT_BYTES, MAX_TOTAL_CONTEXT_BYTES, textByteSize } from "../runtime/context/contextLimits.js";
import type { ContextItem, ContextPartInput } from "../runtime/contracts.js";
import type { ContextResolveResult } from "../runtime/context/contextResolver.js";
import { getTerminalCapture } from "./terminalCapture.js";

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".css", ".scss", ".html",
  ".xml", ".yaml", ".yml", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".cpp", ".c",
  ".h", ".sql", ".sh", ".ps1", ".vue", ".svelte"
]);

/**
 * 创建 Extension Host 侧的上下文解析器。
 */
export function createExtensionContextResolver(options: {
  trusted: boolean;
  capabilities: () => import("../runtime/contracts.js").OpenCodeState["connection"]["capabilities"];
  resolveTempUri?: (tempId: string) => string | undefined;
}): (items: ContextItem[]) => Promise<ContextResolveResult> {
  return async (items) => resolveContextItems(items, options);
}

async function resolveContextItems(
  items: ContextItem[],
  options: {
    trusted: boolean;
    capabilities: () => import("../runtime/contracts.js").OpenCodeState["connection"]["capabilities"];
    resolveTempUri?: (tempId: string) => string | undefined;
  }
): Promise<ContextResolveResult> {
  if (!options.trusted) {
    return {
      items,
      parts: [],
      blocked: true,
      error: "请先信任此工作区后再添加上下文。"
    };
  }

  const resolvedItems: ContextItem[] = [];
  const parts: ContextPartInput[] = [];
  let totalTextBytes = 0;
  let totalAttachmentBytes = 0;
  let blocked = false;
  let error: string | undefined;

  for (const item of items) {
    if (item.error) {
      blocked = true;
      error = item.error;
      resolvedItems.push(item);
      continue;
    }
    try {
      const result = await resolveItem(item, options.capabilities(), options.resolveTempUri);
      const bytes = await measureItemBytes(item, result.parts);
      const isAttachment = item.source.type === "attachment-file" || item.source.type === "attachment-temp";
      const itemLimit = isAttachment ? MAX_ATTACHMENT_BYTES : MAX_CONTEXT_ITEM_BYTES;
      const totalLimit = isAttachment ? MAX_TOTAL_ATTACHMENT_BYTES : MAX_TOTAL_CONTEXT_BYTES;
      const currentTotal = isAttachment ? totalAttachmentBytes : totalTextBytes;
      if (bytes > itemLimit) {
        const failed = {
          ...item,
          error: `上下文过大（${formatByteSize(bytes)}），上限为 ${formatByteSize(itemLimit)}。`
        };
        resolvedItems.push(failed);
        blocked = true;
        error = failed.error;
        continue;
      }
      if (currentTotal + bytes > totalLimit) {
        const failed = {
          ...item,
          error: isAttachment
            ? `全部附件合计超过 ${formatByteSize(MAX_TOTAL_ATTACHMENT_BYTES)}。`
            : `全部上下文合计超过 ${formatByteSize(MAX_TOTAL_CONTEXT_BYTES)}。`
        };
        resolvedItems.push(failed);
        blocked = true;
        error = failed.error;
        continue;
      }
      if (isAttachment) {
        totalAttachmentBytes += bytes;
      } else {
        totalTextBytes += bytes;
      }
      resolvedItems.push({ ...item, sizeLabel: formatByteSize(bytes) });
      parts.push(...result.parts);
    } catch (cause) {
      const failed = {
        ...item,
        error: cause instanceof Error ? cause.message : "读取上下文失败。"
      };
      resolvedItems.push(failed);
      blocked = true;
      error = failed.error;
    }
  }

  return { items: resolvedItems, parts, blocked, error };
}

async function resolveItem(
  item: ContextItem,
  capabilities: import("../runtime/contracts.js").OpenCodeState["connection"]["capabilities"],
  resolveTempUri?: (tempId: string) => string | undefined
): Promise<{ parts: ContextPartInput[] }> {
  switch (item.source.type) {
    case "editor-selection":
      return { parts: [await resolveSelection(item.source)] };
    case "file":
      ensureCapability(capabilities.fileContext, "文件上下文");
      return { parts: [await resolveFilePart(item.source.uri)] };
    case "files":
      ensureCapability(capabilities.fileContext, "文件上下文");
      return {
        parts: await Promise.all(item.source.uris.map((uri) => resolveFilePart(uri)))
      };
    case "folder":
      ensureCapability(capabilities.fileContext, "文件上下文");
      return { parts: [await resolveFolder(item.source.uri)] };
    case "problems":
      ensureCapability(capabilities.problems, "问题诊断");
      return { parts: [resolveProblems(item.source.uri)] };
    case "git-diff":
      ensureCapability(capabilities.gitDiff, "Git 差异");
      return { parts: [await resolveGitDiff(item.source.uri)] };
    case "terminal":
      return { parts: [resolveTerminal(item.source.captureId)] };
    case "terminal-paste":
      return { parts: [{ type: "text", text: formatTerminalPaste(item.source.text) }] };
    case "attachment-file":
      ensureCapability(capabilities.fileContext, "文件附件");
      return { parts: [await resolveAttachmentFile(item.source.uri, item.source.mime, item.label)] };
    case "attachment-temp": {
      ensureCapability(capabilities.fileContext, "文件附件");
      const tempPath = resolveTempUri?.(item.source.tempId);
      if (!tempPath) {
        throw new Error("临时附件已过期或被清理，请重新添加。");
      }
      return {
        parts: [{
          type: "file",
          mime: item.source.mime,
          url: vscode.Uri.file(tempPath).toString(),
          filename: item.source.filename
        }]
      };
    }
    default:
      throw new Error("不支持的上下文类型。");
  }
}

function ensureCapability(capability: { enabled: boolean; reason?: string }, label: string): void {
  if (!capability.enabled) {
    throw new Error(capability.reason ?? `当前连接不支持${label}。`);
  }
}

async function resolveSelection(source: Extract<ContextItem["source"], { type: "editor-selection" }>): Promise<ContextPartInput> {
  const uri = vscode.Uri.parse(source.uri);
  const document = await vscode.workspace.openTextDocument(uri);
  const range = new vscode.Range(
    source.startLine, source.startCharacter,
    source.endLine, source.endCharacter
  );
  const selected = document.getText(range);
  const relative = vscode.workspace.asRelativePath(uri);
  const text = [
    `当前选区：${relative}:${source.startLine + 1}-${source.endLine + 1}`,
    "```",
    selected,
    "```"
  ].join("\n");
  return { type: "text", text };
}

async function resolveFilePart(uriString: string): Promise<ContextPartInput> {
  const uri = vscode.Uri.parse(uriString);
  if (!isTextLike(uri)) {
    return resolveAttachmentFile(uriString, guessMime(uri), vscode.workspace.asRelativePath(uri));
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const text = [
    `文件：${vscode.workspace.asRelativePath(uri)}`,
    "```",
    document.getText(),
    "```"
  ].join("\n");
  return { type: "text", text };
}

async function resolveFolder(uriString: string): Promise<ContextPartInput> {
  const uri = vscode.Uri.parse(uriString);
  const entries = await vscode.workspace.fs.readDirectory(uri);
  const lines = entries.slice(0, 200).map(([name, type]) => `${type === vscode.FileType.Directory ? "[目录]" : "[文件]"} ${name}`);
  const text = [
    `文件夹：${vscode.workspace.asRelativePath(uri)}`,
    lines.join("\n"),
    entries.length > 200 ? `\n… 另有 ${entries.length - 200} 项未列出` : ""
  ].join("\n");
  return { type: "text", text };
}

function resolveProblems(uriString?: string): ContextPartInput {
  const targets = uriString
    ? [vscode.Uri.parse(uriString)]
    : vscode.workspace.textDocuments.map((document) => document.uri);
  const lines: string[] = [];
  for (const uri of targets) {
    for (const diagnostic of vscode.languages.getDiagnostics(uri)) {
      const position = diagnostic.range.start;
      lines.push(
        `${vscode.workspace.asRelativePath(uri)}:${position.line + 1}:${position.character + 1} ${severityLabel(diagnostic.severity)} ${diagnostic.message}`
      );
    }
  }
  if (lines.length === 0) {
    throw new Error("当前没有可添加的问题诊断。");
  }
  return {
    type: "text",
    text: ["问题诊断：", ...lines].join("\n")
  };
}

async function resolveGitDiff(uriString?: string): Promise<ContextPartInput> {
  const git = vscode.extensions.getExtension("vscode.git")?.exports;
  const api = git?.getAPI?.(1);
  const repo = api?.repositories?.[0];
  if (!repo) {
    throw new Error("未检测到 Git 仓库，无法添加差异。");
  }
  const diff = uriString
    ? await repo.diff(vscode.Uri.parse(uriString))
    : await repo.diffIndexWithHEAD();
  if (!diff?.trim()) {
    throw new Error("当前没有可添加的 Git 差异。");
  }
  return {
    type: "text",
    text: ["Git 差异：", "```diff", diff, "```"].join("\n")
  };
}

function resolveTerminal(captureId: string): ContextPartInput {
  const capture = getTerminalCapture(captureId);
  if (!capture) {
    throw new Error("终端监听已结束或不可用。");
  }
  const header = capture.limitation ? `终端输出（${capture.limitation}）：` : "终端输出：";
  return {
    type: "text",
    text: [header, "```", capture.text || "(无输出)", "```"].join("\n")
  };
}

function formatTerminalPaste(text: string): string {
  return ["粘贴的终端文本：", "```", text, "```"].join("\n");
}

async function resolveAttachmentFile(uriString: string, mime: string, filename: string): Promise<ContextPartInput> {
  const uri = vscode.Uri.parse(uriString);
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`附件过大（${formatByteSize(stat.size)}），上限为 ${formatByteSize(MAX_ATTACHMENT_BYTES)}。`);
  }
  return {
    type: "file",
    mime,
    url: uri.toString(),
    filename
  };
}

async function measureItemBytes(item: ContextItem, parts: ContextPartInput[]): Promise<number> {
  if (item.source.type === "attachment-temp") {
    return item.source.sizeBytes;
  }
  if (item.source.type === "attachment-file") {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.parse(item.source.uri));
    return stat.size;
  }
  return parts.reduce((sum, part) => sum + (part.type === "text" ? textByteSize(part.text) : 0), 0);
}

function isTextLike(uri: vscode.Uri): boolean {
  const extension = uri.path.includes(".") ? uri.path.slice(uri.path.lastIndexOf(".")) : "";
  return TEXT_EXTENSIONS.has(extension.toLowerCase());
}

function guessMime(uri: vscode.Uri): string {
  const extension = uri.path.slice(uri.path.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf"
  };
  return map[extension] ?? "application/octet-stream";
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error: return "错误";
    case vscode.DiagnosticSeverity.Warning: return "警告";
    case vscode.DiagnosticSeverity.Information: return "信息";
    default: return "提示";
  }
}
