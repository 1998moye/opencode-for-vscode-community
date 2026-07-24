import type { HLJSApi } from "highlight.js";

export type TodoItem = {
  content: string;
  status: string;
  priority?: string;
};

export type PayloadSegment =
  | { kind: "path"; text: string }
  | { kind: "code"; text: string; language: string; diffAll?: "add" }
  | { kind: "edit-diff"; oldText: string; newText: string; language: string }
  | { kind: "meta"; key: string; value: string; highlight?: boolean }
  | { kind: "text"; text: string }
  | { kind: "section"; title: string; segments: PayloadSegment[] }
  | { kind: "todos"; items: TodoItem[] }
  | { kind: "markdown"; text: string }
  | { kind: "dir-list"; basePath: string; entries: string[] };

const SHELL_TOOLS = new Set(["bash", "powershell", "shell"]);
const WRITE_TOOLS = new Set(["write"]);
const EDIT_TOOLS = new Set(["edit"]);
const READ_TOOLS = new Set(["read"]);
const SEARCH_TOOLS = new Set(["glob", "grep"]);
const TODO_TOOLS = new Set(["todowrite", "towrite"]);

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "bash"
};

let hljsPromise: Promise<HLJSApi> | undefined;

/**
 * 首次高亮时再加载 highlight.js，避免拖慢 Webview 首屏。
 */
async function loadHighlightJs(): Promise<HLJSApi> {
  if (!hljsPromise) {
    hljsPromise = (async () => {
      const [
        { default: hljs },
        { default: javascript },
        { default: typescript },
        { default: bash },
        { default: json },
        { default: python },
        { default: css },
        { default: xml },
        { default: markdown },
        { default: yaml },
        { default: rust },
        { default: go },
        { default: sql },
        { default: java }
      ] = await Promise.all([
        import("highlight.js/lib/core"),
        import("highlight.js/lib/languages/javascript"),
        import("highlight.js/lib/languages/typescript"),
        import("highlight.js/lib/languages/bash"),
        import("highlight.js/lib/languages/json"),
        import("highlight.js/lib/languages/python"),
        import("highlight.js/lib/languages/css"),
        import("highlight.js/lib/languages/xml"),
        import("highlight.js/lib/languages/markdown"),
        import("highlight.js/lib/languages/yaml"),
        import("highlight.js/lib/languages/rust"),
        import("highlight.js/lib/languages/go"),
        import("highlight.js/lib/languages/sql"),
        import("highlight.js/lib/languages/java")
      ]);
      hljs.registerLanguage("javascript", javascript);
      hljs.registerLanguage("typescript", typescript);
      hljs.registerLanguage("bash", bash);
      hljs.registerLanguage("shell", bash);
      hljs.registerLanguage("json", json);
      hljs.registerLanguage("python", python);
      hljs.registerLanguage("css", css);
      hljs.registerLanguage("html", xml);
      hljs.registerLanguage("xml", xml);
      hljs.registerLanguage("markdown", markdown);
      hljs.registerLanguage("yaml", yaml);
      hljs.registerLanguage("rust", rust);
      hljs.registerLanguage("go", go);
      hljs.registerLanguage("sql", sql);
      hljs.registerLanguage("java", java);
      return hljs;
    })();
  }
  return hljsPromise;
}

/**
 * 归一化 OpenCode 工具名（大小写、下划线不敏感）。
 */
export function normalizeToolKind(toolLabel: string): string {
  return toolLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * 根据文件路径推断 highlight.js 语言 id。
 */
export function languageFromPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const fileName = normalized.split("/").pop() ?? normalized;
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    return undefined;
  }
  return EXTENSION_LANGUAGE[fileName.slice(dot + 1).toLowerCase()];
}

/**
 * 把工具载荷正文拆成可分别渲染的路径、元数据、代码块与纯文本段。
 */
export function parseToolPayloadSegments(
  toolLabel: string,
  body: string,
  variant: "input" | "output" = "input"
): PayloadSegment[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }
  const tool = normalizeToolKind(toolLabel);
  if (TODO_TOOLS.has(tool)) {
    const todos = parseTodoPayload(trimmed);
    if (todos) {
      return [{ kind: "todos", items: todos }];
    }
  }
  if (READ_TOOLS.has(tool)) {
    const readSegments = parseReadPayload(trimmed);
    if (readSegments.length > 0) {
      return readSegments;
    }
  }
  if (variant === "input" && SHELL_TOOLS.has(tool)) {
    return [{ kind: "code", text: trimmed, language: "bash" }];
  }
  if (variant === "input" && WRITE_TOOLS.has(tool)) {
    return parseWritePayload(trimmed);
  }
  if (variant === "input" && EDIT_TOOLS.has(tool)) {
    return parseEditPayload(trimmed);
  }
  if (variant === "output" && SHELL_TOOLS.has(tool)) {
    return parseShellOutputPayload(trimmed);
  }
  if (variant === "output" && SEARCH_TOOLS.has(tool)) {
    const searchSegments = parseSearchResultPayload(trimmed);
    if (searchSegments.length > 0) {
      return searchSegments;
    }
  }
  const structured = parseStructuredFallback(trimmed);
  if (structured) {
    return structured;
  }
  return [{ kind: "text", text: trimmed }];
}

function parseStructuredFallback(body: string): PayloadSegment[] | undefined {
  const todos = parseTodoPayload(body);
  if (todos) {
    return [{ kind: "todos", items: todos }];
  }
  const readSegments = parseReadPayload(body);
  if (readSegments.length > 0) {
    return readSegments;
  }
  return undefined;
}

function parseReadPayload(body: string): PayloadSegment[] {
  const pathMatch = body.match(/<path>([\s\S]*?)<\/path>/i);
  const typeMatch = body.match(/<type>([\s\S]*?)<\/type>/i);
  const entriesMatch = body.match(/<entries>([\s\S]*?)<\/entries>/i);
  const isDirectory = typeMatch?.[1]?.trim().toLowerCase() === "directory" || Boolean(entriesMatch);
  if (isDirectory) {
    const path = pathMatch?.[1]?.trim() ?? "";
    const entries = parseDirectoryEntries(entriesMatch?.[1] ?? "");
    const segments: PayloadSegment[] = [];
    if (path) {
      segments.push({ kind: "path", text: path });
    }
    if (entries.length > 0) {
      segments.push({ kind: "dir-list", basePath: path, entries });
    }
    return segments;
  }
  const contentMatch = body.match(/<content>([\s\S]*?)<\/content>/i);
  if (contentMatch) {
    const path = pathMatch?.[1]?.trim() ?? "";
    const content = stripLineNumberPrefixes(contentMatch[1]!.trim());
    return buildFileContentSegments(path, content, { renderMarkdown: true });
  }
  const split = body.indexOf("\n\n");
  if (split === -1) {
    const lines = body
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 1 && looksLikeFilePath(lines[0]!)) {
      return [{ kind: "path", text: lines[0]! }];
    }
    return [];
  }
  const header = body.slice(0, split).trim();
  const content = stripLineNumberPrefixes(body.slice(split + 2));
  if (!looksLikeFilePath(header)) {
    return [];
  }
  return buildFileContentSegments(header, content, { renderMarkdown: true });
}

function buildFileContentSegments(
  path: string,
  content: string,
  options?: { diffAll?: "add"; renderMarkdown?: boolean }
): PayloadSegment[] {
  const language = languageFromPath(path) ?? "plaintext";
  const segments: PayloadSegment[] = [];
  if (path) {
    segments.push({ kind: "path", text: path });
  }
  const trimmed = content.trimEnd();
  if (!trimmed) {
    return segments;
  }
  if (options?.renderMarkdown && language === "markdown") {
    segments.push({ kind: "markdown", text: trimmed });
  } else if (language === "plaintext") {
    segments.push({ kind: "text", text: trimmed });
  } else {
    segments.push({
      kind: "code",
      text: trimmed,
      language,
      ...(options?.diffAll ? { diffAll: options.diffAll } : {})
    });
  }
  return segments;
}

function looksLikeFilePath(text: string): boolean {
  const line = text.trim().split("\n")[0]!.trim();
  if (/^[a-zA-Z]:[\\/]/.test(line)) {
    return true;
  }
  if (/^(?:\/|\.\/|\.\.\/)/.test(line)) {
    return true;
  }
  return /^[^\s/\\]+\.[a-z0-9]+$/i.test(line);
}

/**
 * 解析 Glob/Grep 输出：计数摘要与可点击文件路径分行展示。
 */
export function parseSearchResultPayload(body: string): PayloadSegment[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }
  const combined = trimmed.match(/^(\d+)\s*条结果\s+(.+)$/);
  if (combined) {
    const segments: PayloadSegment[] = [{ kind: "text", text: `${combined[1]} 条结果` }];
    for (const path of splitSearchResultPaths(combined[2]!)) {
      segments.push({ kind: "path", text: path });
    }
    return segments;
  }
  if (trimmed === "无匹配结果") {
    return [{ kind: "text", text: "无匹配结果" }];
  }
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const segments: PayloadSegment[] = [];
  let index = 0;
  const header = lines[0]!;
  if (/^\d+\s*条结果$/.test(header)) {
    segments.push({ kind: "text", text: header });
    index = 1;
  } else if (header === "无匹配结果" && lines.length === 1) {
    return [{ kind: "text", text: "无匹配结果" }];
  }
  for (const line of lines.slice(index)) {
    const inline = line.match(/^(\d+)\s*条结果\s+(.+)$/);
    if (inline) {
      if (segments.every((segment) => segment.kind !== "text" || !/条结果$/.test(segment.text))) {
        segments.push({ kind: "text", text: `${inline[1]} 条结果` });
      }
      for (const path of splitSearchResultPaths(inline[2]!)) {
        segments.push({ kind: "path", text: path });
      }
      continue;
    }
    for (const path of splitSearchResultPaths(line)) {
      if (looksLikeFilePath(path)) {
        segments.push({ kind: "path", text: path });
      } else {
        segments.push({ kind: "text", text: line });
      }
    }
  }
  return segments;
}

function splitSearchResultPaths(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  if (looksLikeFilePath(trimmed)) {
    return [trimmed];
  }
  return [trimmed];
}

/**
 * 解析 Read 目录输出里的 `<entries>` 列表。
 */
export function parseDirectoryEntries(raw: string): string[] {
  const cleaned = raw.trim().replace(/\(\d+\s*entries?\)\s*$/i, "").trim();
  if (!cleaned) {
    return [];
  }
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\(\d+\s*entries?\)$/i.test(line));
  if (lines.length > 1) {
    return lines;
  }
  return lines;
}

/**
 * 拼接目录路径与条目名。
 */
export function joinDirectoryEntry(basePath: string, entry: string): string {
  const normalizedBase = basePath.replace(/[\\/]+$/, "");
  const separator = normalizedBase.includes("\\") ? "\\" : "/";
  return `${normalizedBase}${separator}${entry.replace(/^[\\/]+/, "")}`;
}

/**
 * 去掉 Read 工具输出里常见的行号前缀（`1|`、`1:` 等）。
 */
export function stripLineNumberPrefixes(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+(?:[|:])\s?/, ""))
    .join("\n");
}

function parseTodoPayload(body: string): TodoItem[] | undefined {
  const checklist = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\[[ x~]\]/i.test(line));
  if (checklist.length > 0) {
    return checklist.map((line) => {
      const match = line.match(/^\[([ x~])\]\s*(.*)$/i);
      const mark = match?.[1]?.toLowerCase() ?? " ";
      const status = mark === "x" ? "completed" : mark === "~" ? "in_progress" : "pending";
      return { content: match?.[2]?.trim() ?? line, status };
    });
  }
  const jsonSource = extractJsonArray(body);
  if (!jsonSource) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(jsonSource) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const items = parsed
      .map((entry) => normalizeTodoItem(entry))
      .filter((entry): entry is TodoItem => entry !== undefined);
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}

function extractJsonArray(body: string): string | undefined {
  const labeled = body.match(/todos:\s*(?:\[\d+\s*项\]\s*)?(\[[\s\S]*\])\s*$/i);
  if (labeled?.[1]) {
    return labeled[1];
  }
  const trimmed = body.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }
  const block = body.match(/(\[[\s\S]*\])\s*$/);
  return block?.[1];
}

function normalizeTodoItem(entry: unknown): TodoItem | undefined {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  const obj = entry as Record<string, unknown>;
  const content = typeof obj.content === "string" ? obj.content : String(obj.content ?? "");
  if (!content.trim()) {
    return undefined;
  }
  const status = typeof obj.status === "string" ? obj.status : "pending";
  const priority = typeof obj.priority === "string" ? obj.priority : undefined;
  return priority ? { content, status, priority } : { content, status };
}

function parseWritePayload(body: string): PayloadSegment[] {
  const split = body.indexOf("\n\n");
  if (split === -1) {
    const language = languageFromPath(body) ?? "plaintext";
    if (language === "plaintext") {
      return [{ kind: "text", text: body }];
    }
    return [{ kind: "code", text: body, language, diffAll: "add" }];
  }
  return buildFileContentSegments(body.slice(0, split).trim(), body.slice(split + 2), {
    diffAll: "add",
    renderMarkdown: false
  });
}

function parseEditPayload(body: string): PayloadSegment[] {
  const segments: PayloadSegment[] = [];
  let rest = body.trim();
  let language = "plaintext";
  const firstLineBreak = rest.indexOf("\n");
  const firstLine = firstLineBreak === -1 ? rest : rest.slice(0, firstLineBreak);
  const editHeader = firstLine.match(/^编辑\s+(.+)$/);
  if (editHeader) {
    const path = editHeader[1]!.trim();
    segments.push({ kind: "path", text: path });
    language = languageFromPath(path) ?? "plaintext";
    rest = firstLineBreak === -1 ? "" : rest.slice(firstLineBreak + 1).replace(/^\n+/, "");
  }
  const sectionRegex = /---\s*(旧|新)\s*---\n([\s\S]*?)(?=\n\n---\s*(?:旧|新)\s*---\n|$)/g;
  let oldChunk = "";
  let newChunk = "";
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(rest)) !== null) {
    const chunk = (match[2] ?? "").replace(/\n$/, "").trim();
    if (match[1] === "旧") {
      oldChunk = chunk;
    } else {
      newChunk = chunk;
    }
  }
  if (oldChunk && newChunk) {
    segments.push({ kind: "edit-diff", oldText: oldChunk, newText: newChunk, language });
    return segments;
  }
  if (newChunk) {
    if (language === "plaintext") {
      segments.push({ kind: "text", text: newChunk });
    } else {
      segments.push({ kind: "code", text: newChunk, language, diffAll: "add" });
    }
    return segments;
  }
  if (oldChunk) {
    if (language === "plaintext") {
      segments.push({ kind: "text", text: oldChunk });
    } else {
      segments.push({ kind: "code", text: oldChunk, language });
    }
    return segments;
  }
  if (rest.trim()) {
    segments.push({ kind: "text", text: rest.trim() });
  }
  return segments;
}

function parseShellOutputPayload(body: string): PayloadSegment[] {
  const lines = body.split("\n");
  const segments: PayloadSegment[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const metaMatch = line.match(/^(command|workdir|cwd|directory):\s*(.*)$/i);
    if (metaMatch) {
      segments.push({
        kind: "meta",
        key: metaMatch[1]!.toLowerCase(),
        value: metaMatch[2] ?? "",
        highlight: metaMatch[1]!.toLowerCase() === "command"
      });
      index += 1;
      continue;
    }
    break;
  }
  const remainder = lines.slice(index).join("\n").trim();
  if (remainder) {
    segments.push({ kind: "text", text: remainder });
  }
  if (segments.length === 0) {
    return [{ kind: "text", text: body }];
  }
  return segments;
}

/**
 * 使用 highlight.js 生成高亮 HTML；失败时回退为转义纯文本。
 */
export async function highlightCodeHtml(code: string, language: string): Promise<string> {
  try {
    const highlighter = await loadHighlightJs();
    const normalized = language.toLowerCase();
    if (normalized !== "plaintext" && highlighter.getLanguage(normalized)) {
      return highlighter.highlight(code, { language: normalized, ignoreIllegals: true }).value;
    }
    const auto = highlighter.highlightAuto(code, highlighter.listLanguages());
    if (auto.relevance > 5) {
      return auto.value;
    }
  } catch {
    // 高亮失败时降级，避免拖垮整个 Webview。
  }
  return escapeHtml(code);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
