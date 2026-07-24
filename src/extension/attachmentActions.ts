import * as path from "node:path";
import * as vscode from "vscode";
import type { ContextItem, OpenCodeRuntime } from "../runtime/contracts.js";
import { formatByteSize, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from "../runtime/context/contextLimits.js";
import type { AttachmentTempStore } from "./attachmentTempStore.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const PDF_MIMES = new Set(["application/pdf"]);
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

export interface AttachmentActions {
  pickAttachments(): Promise<void>;
  addBinaryAttachment(mime: string, filename: string, dataBase64: string): Promise<void>;
  addFileAttachments(uris: string[]): Promise<void>;
  releaseItem(item: ContextItem): Promise<void>;
}

/**
 * 创建图片与 PDF 附件的 Extension Host 操作。
 */
export function createAttachmentActions(options: {
  runtime: OpenCodeRuntime;
  tempStore: AttachmentTempStore;
  trusted: boolean;
  toPreviewUri(uri: vscode.Uri): string;
}): AttachmentActions {
  return {
    pickAttachments: () => pickComposerFiles(options),
    addBinaryAttachment: (mime, filename, dataBase64) => addBinaryAttachment(options, mime, filename, dataBase64),
    addFileAttachments: (uris) => addFileAttachments(options, uris),
    releaseItem: (item) => options.tempStore.deleteForItem(item)
  };
}

/**
 * 打开系统文件选择器：图片/PDF 作为附件，其余作为文件上下文。
 */
async function pickComposerFiles(options: {
  runtime: OpenCodeRuntime;
  trusted: boolean;
  toPreviewUri(uri: vscode.Uri): string;
}): Promise<void> {
  if (!options.trusted) {
    void vscode.window.showWarningMessage("请先信任此工作区后再添加文件。");
    return;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFolders: false,
    openLabel: "添加"
  });
  if (!picked?.length) {
    return;
  }
  await addFileAttachments(options, picked.map((uri) => uri.toString()));
}

async function addFileAttachments(
  options: {
    runtime: OpenCodeRuntime;
    toPreviewUri(uri: vscode.Uri): string;
  },
  uriStrings: string[]
): Promise<void> {
  for (const uriString of uriStrings) {
    const uri = vscode.Uri.parse(uriString);
    const attachmentKind = classifyAttachment(uri, undefined);
    if (attachmentKind) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        void vscode.window.showWarningMessage(
          `附件过大（${formatByteSize(stat.size)}），上限为 ${formatByteSize(MAX_ATTACHMENT_BYTES)}。`
        );
        continue;
      }
      const item = await buildFileAttachmentItem(uri, attachmentKind, stat.size, options.toPreviewUri);
      await options.runtime.dispatch({ type: "add-context-item", item });
      continue;
    }
    const item = buildFileContextItem(uri);
    await options.runtime.dispatch({ type: "add-context-item", item });
  }
}

async function addBinaryAttachment(
  options: {
    runtime: OpenCodeRuntime;
    tempStore: AttachmentTempStore;
    trusted: boolean;
    toPreviewUri(uri: vscode.Uri): string;
  },
  mime: string,
  filename: string,
  dataBase64: string
): Promise<void> {
  if (!options.trusted) {
    void vscode.window.showWarningMessage("请先信任此工作区后再添加附件。");
    return;
  }
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    void vscode.window.showWarningMessage(
      `附件过大（${formatByteSize(bytes.byteLength)}），上限为 ${formatByteSize(MAX_ATTACHMENT_BYTES)}。`
    );
    return;
  }
  const kind = classifyAttachment(undefined, mime);
  if (!kind) {
    void vscode.window.showWarningMessage("仅支持图片与 PDF 附件。");
    return;
  }
  const saved = await options.tempStore.save(bytes, mime, sanitizeFilename(filename, kind));
  const previewUri = kind === "image"
    ? createImageDataUri(bytes, mime) ?? options.toPreviewUri(vscode.Uri.file(saved.uri))
    : undefined;
  const item: ContextItem = {
    id: `attachment-temp-${saved.tempId}`,
    kind,
    label: saved.filename,
    sizeLabel: formatByteSize(saved.sizeBytes),
    status: "ready",
    previewUri,
    source: {
      type: "attachment-temp",
      tempId: saved.tempId,
      mime,
      filename: saved.filename,
      sizeBytes: saved.sizeBytes
    }
  };
  await options.runtime.dispatch({ type: "add-context-item", item });
}

async function buildFileAttachmentItem(
  uri: vscode.Uri,
  kind: "image" | "pdf" | "attachment",
  sizeBytes: number,
  toPreviewUri: (uri: vscode.Uri) => string
): Promise<ContextItem> {
  const label = displayBasename(uri);
  let previewUri: string | undefined;
  if (kind === "image") {
    const bytes = await readFileBytes(uri, MAX_PREVIEW_BYTES);
    previewUri = bytes ? createImageDataUri(bytes, guessMime(uri, kind)) : toPreviewUri(uri);
  }
  return {
    id: `attachment-file-${uri.toString()}`,
    kind,
    label,
    sizeLabel: formatByteSize(sizeBytes),
    status: "ready",
    previewUri,
    source: {
      type: "attachment-file",
      uri: uri.toString(),
      mime: guessMime(uri, kind)
    }
  };
}

function buildFileContextItem(uri: vscode.Uri): ContextItem {
  return {
    id: `file-${uri.toString()}-${Date.now()}`,
    kind: "file",
    label: displayBasename(uri),
    source: { type: "file", uri: uri.toString() }
  };
}

function displayBasename(uri: vscode.Uri): string {
  return path.basename(uri.fsPath);
}

function classifyAttachment(uri: vscode.Uri | undefined, mime: string | undefined): "image" | "pdf" | "attachment" {
  if (mime && PDF_MIMES.has(mime)) {
    return "pdf";
  }
  if (mime && IMAGE_MIMES.has(mime)) {
    return "image";
  }
  if (!uri) {
    return "attachment";
  }
  const extension = uri.path.slice(uri.path.lastIndexOf(".")).toLowerCase();
  if (PDF_EXTENSIONS.has(extension)) {
    return "pdf";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  return "attachment";
}

function guessMime(uri: vscode.Uri, kind: "image" | "pdf" | "attachment"): string {
  if (kind === "pdf") {
    return "application/pdf";
  }
  const extension = uri.path.slice(uri.path.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".js": "text/javascript",
    ".jsx": "text/javascript",
    ".py": "text/x-python",
    ".go": "text/x-go",
    ".java": "text/x-java",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml"
  };
  return map[extension] ?? "application/octet-stream";
}

function sanitizeFilename(filename: string, kind: "image" | "pdf" | "attachment"): string {
  const fallback = kind === "pdf" ? "document.pdf" : kind === "image" ? "screenshot.png" : "attachment.bin";
  const base = filename.replace(/[^\w.\-()]/g, "_") || fallback;
  const extension = kind === "pdf" ? "pdf" : kind === "image" ? "png" : "bin";
  return base.includes(".") ? base : `${base}.${extension}`;
}

/**
 * 统计附件总大小并在超限时返回错误文案。
 */
export function totalAttachmentBytes(items: ContextItem[]): number {
  return items.reduce((sum, item) => {
    if (item.source.type === "attachment-temp") {
      return sum + item.source.sizeBytes;
    }
    if (item.source.type === "attachment-file") {
      return sum;
    }
    return sum;
  }, 0);
}

export function exceedsAttachmentBudget(items: ContextItem[], nextBytes: number): boolean {
  return totalAttachmentBytes(items) + nextBytes > MAX_TOTAL_ATTACHMENT_BYTES;
}

async function readFileBytes(uri: vscode.Uri, maxBytes: number): Promise<Uint8Array | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > maxBytes) {
      return undefined;
    }
    return await vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
}

function createImageDataUri(bytes: Uint8Array, mime: string): string | undefined {
  if (!IMAGE_MIMES.has(mime)) {
    return undefined;
  }
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
