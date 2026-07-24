/**
 * Shell 删除命令解析：供会话变更账本识别 Agent 通过终端删除的文件。
 *
 * 维护清单（`DELETE_COMMAND_PARSERS`）：
 * - Unix：`rm`、`unlink`、`rmdir`/`rd`、`find … -delete` / `find … -exec rm`、`shred`
 * - Windows CMD：`del` / `erase`
 * - PowerShell：`Remove-Item` / 别名 `ri`（`-Path` / `-LiteralPath` 或位置参数）
 * - Git：`git rm`、`git clean -f`（可选目录参数）
 * - 回收站：`gio trash`、`trash-put`、`gvfs-trash`、独立 `trash` 子命令
 * - Node：`rimraf` / `npx rimraf`
 * - 脚本片段：Python `os.remove`/`unlink`/`shutil.rmtree`、Path.unlink；Node `fs.unlink`/`fs.rm`/`rimraf`
 * - 链式：按 `&&`、`||`、`;` 分段后分别解析
 * - 通配符路径（`*` `?` `[`）不入账
 */

/** 通配符路径无法安全入账为单文件，仅记录显式路径。 */
const WILDCARD_PATH = /[*?[\]]/;

/**
 * 将 Server / 工具返回的状态归一为账本状态。
 */
export function normalizeLedgerStatus(raw: unknown): "added" | "modified" | "deleted" {
  const value = String(raw ?? "modified").toLowerCase();
  if (value === "added" || value === "add" || value === "create" || value === "created") {
    return "added";
  }
  if (value === "deleted" || value === "delete" || value === "removed" || value === "remove") {
    return "deleted";
  }
  return "modified";
}

/**
 * 汇总 shell / 脚本删除类命令中的目标路径（支持 `;` / `&&` / `||` 链式）。
 */
export function pathsFromShellDeleteCommand(command: string): string[] {
  const normalized = command.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  const segments = splitCommandSegments(normalized);
  const combined: string[] = [];
  for (const segment of segments) {
    for (const parse of DELETE_COMMAND_PARSERS) {
      combined.push(...parse(segment));
    }
  }
  return dedupePaths(combined.filter((path) => path && !WILDCARD_PATH.test(path)));
}

const DELETE_COMMAND_PARSERS: Array<(segment: string) => string[]> = [
  pathsFromRmCommand,
  pathsFromUnlinkCommand,
  pathsFromRmdirCommand,
  pathsFromPowerShellRemoveItem,
  pathsFromWindowsDel,
  pathsFromTrashCommand,
  pathsFromGitRmCommand,
  pathsFromGitCleanCommand,
  pathsFromFindDeleteCommand,
  pathsFromShredCommand,
  pathsFromRimrafCommand,
  pathsFromScriptDeleteSnippets
];

function splitCommandSegments(command: string): string[] {
  const parts = command.split(/(?:&&|\|\||;)/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [command];
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const key = path.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(path);
  }
  return result;
}

/**
 * Unix `rm`。
 */
export function pathsFromRmCommand(command: string): string[] {
  const match = command.match(/\brm\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + 2).trim());
}

/**
 * Unix `unlink`。
 */
export function pathsFromUnlinkCommand(command: string): string[] {
  const match = command.match(/\bunlink\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + 6).trim());
}

/**
 * `rmdir` / `rd`。
 */
export function pathsFromRmdirCommand(command: string): string[] {
  const match = command.match(/\b(?:rmdir|rd)\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + match[0].length).trim());
}

/**
 * PowerShell `Remove-Item` / 别名 `ri`。
 */
export function pathsFromPowerShellRemoveItem(command: string): string[] {
  if (!/\bRemove-Item\b/i.test(command) && !/\bri\s/i.test(command)) {
    return [];
  }
  const paths: string[] = [];
  for (const match of command.matchAll(
    /-(?:LiteralPath|Path|lp)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi
  )) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (raw) {
      paths.push(raw);
    }
  }
  const cmdlet = command.match(/\b(?:Remove-Item|ri)\b/i);
  if (cmdlet && cmdlet.index !== undefined && paths.length === 0) {
    paths.push(...tokenizeShellPaths(command.slice(cmdlet.index + cmdlet[0].length).trim()));
  }
  return paths;
}

/**
 * Windows CMD `del` / `erase`。
 */
export function pathsFromWindowsDel(command: string): string[] {
  const match = command.match(/\b(?:del|erase)\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + match[0].length).trim());
}

/**
 * 回收站类命令。
 */
export function pathsFromTrashCommand(command: string): string[] {
  const patterns: Array<{ re: RegExp; skip: number }> = [
    { re: /\bgio\s+trash\b/i, skip: 9 },
    { re: /\btrash-put\b/i, skip: 9 },
    { re: /\bgvfs-trash\b/i, skip: 10 },
    { re: /\btrash\b/i, skip: 5 }
  ];
  for (const { re, skip } of patterns) {
    const match = command.match(re);
    if (match && match.index !== undefined) {
      return tokenizeShellPaths(command.slice(match.index + skip).trim());
    }
  }
  return [];
}

/**
 * `git rm`。
 */
export function pathsFromGitRmCommand(command: string): string[] {
  const match = command.match(/\bgit\s+rm\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + 6).trim());
}

/**
 * `git clean -f` / `-fd` / `-fdx`（末尾可选显式目录）。
 */
export function pathsFromGitCleanCommand(command: string): string[] {
  const match = command.match(/\bgit\s+clean\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  const rest = command.slice(match.index + match[0].length).trim();
  if (!/(?:^|\s)-f/i.test(rest)) {
    return [];
  }
  const tokens = tokenizeShellPaths(rest);
  const dirs = tokens.filter((token) => !/^-/.test(token));
  return dirs.length > 0 ? dirs : [];
}

/**
 * `rimraf` / `npx rimraf` / `pnpm exec rimraf`。
 */
export function pathsFromRimrafCommand(command: string): string[] {
  const match = command.match(/\brimraf\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + 6).trim());
}

/**
 * `find ... -delete` / `find ... -exec rm`（提取 find 起始路径）。
 */
export function pathsFromFindDeleteCommand(command: string): string[] {
  if (!/\bfind\b/i.test(command) || !/(?:-delete\b|-exec\s+rm\b)/i.test(command)) {
    return [];
  }
  const match = command.match(/\bfind\s+(\S+)/i);
  if (!match?.[1]) {
    return [];
  }
  const root = match[1].replace(/^['"]|['"]$/g, "");
  return root && !WILDCARD_PATH.test(root) ? [root] : [];
}

/**
 * `shred -u`。
 */
export function pathsFromShredCommand(command: string): string[] {
  const match = command.match(/\bshred\b/i);
  if (!match || match.index === undefined) {
    return [];
  }
  return tokenizeShellPaths(command.slice(match.index + 5).trim());
}

/**
 * Python / Node 内联删除。
 */
export function pathsFromScriptDeleteSnippets(command: string): string[] {
  const paths: string[] = [];
  const patterns = [
    /os\.(?:remove|unlink)\s*\(\s*(?:['"]([^'"]+)['"])/g,
    /shutil\.rmtree\s*\(\s*(?:['"]([^'"]+)['"])/g,
    /pathlib\.Path\s*\(\s*(?:['"]([^'"]+)['"])\s*\)\.unlink/g,
    /Path\s*\(\s*(?:['"]([^'"]+)['"])\s*\)\.unlink/g,
    /fs\.(?:unlink|rm)Sync?\s*\(\s*(?:['"]([^'"]+)['"])/g,
    /fs\.promises\.(?:unlink|rm)\s*\(\s*(?:['"]([^'"]+)['"])/g,
    /fs\.rmSync?\s*\(\s*(?:['"]([^'"]+)['"])/g,
    /\.rmSync?\s*\(\s*(?:['"]([^'"]+)['"])/g,
    /\brimraf\s*\(\s*(?:['"]([^'"]+)['"])/g
  ];
  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      if (match[1]) {
        paths.push(match[1]);
      }
    }
  }
  return paths;
}

/**
 * 跳过常见开关，只收集路径形参数。
 */
function tokenizeShellPaths(rest: string): string[] {
  const paths: string[] = [];
  while (rest.length > 0) {
    rest = rest.trim();
    if (!rest) {
      break;
    }
    if (rest.startsWith("-") || rest.startsWith("/")) {
      const flag = rest.match(/^(?:\/[a-z]+|-+[a-zA-Z]+(?::\$?\w+)?)/i);
      if (flag) {
        rest = rest.slice(flag[0].length).trim();
        continue;
      }
    }
    const quoted = rest.match(/^"([^"]*)"/) ?? rest.match(/^'([^']*)'/);
    if (quoted) {
      paths.push(quoted[1] ?? "");
      rest = rest.slice(quoted[0].length).trim();
      continue;
    }
    const token = rest.match(/^(\S+)/);
    if (!token?.[1]) {
      break;
    }
    const value = token[1].replace(/;$/, "");
    if (!/^-/.test(value) && !/^\/[a-z]+$/i.test(value) && !/^(?:&&|\|\||cmd)$/i.test(value)) {
      paths.push(value);
    }
    rest = rest.slice(token[0].length).trim();
  }
  return paths.map((path) => path.trim()).filter(Boolean);
}

/**
 * 去掉 Read 工具正文里的 `1:` / `1|` 行号前缀。
 */
export function stripReadLineNumberPrefixes(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+(?:[|:])\s?/, ""))
    .join("\n");
}

/**
 * 从 Read 工具原始 output 提取可写回磁盘的文件正文（`<content>` 内，无 XML 包裹）。
 */
export function extractReadToolFileContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const contentMatch = trimmed.match(/<content\b[^>]*>([\s\S]*?)<\/content>/i);
  if (contentMatch) {
    let body = contentMatch[1]!.trimStart();
    body = body.replace(/\n?\(End of file[^\n]*\)\s*$/i, "");
    return stripReadLineNumberPrefixes(body);
  }
  if (/<path\b/i.test(trimmed) || /<type\b/i.test(trimmed)) {
    return "";
  }
  return stripReadLineNumberPrefixes(trimmed);
}

/**
 * 相对路径解析到工作区目录下绝对路径。
 */
export function resolvePathUnderDirectory(directory: string, candidate: string): string {
  const normalized = candidate.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) {
    return normalized;
  }
  const base = directory.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${base}/${normalized.replace(/^\.?\//, "")}`;
}

/**
 * 按完整路径或文件名在 Read 索引中查找删除前内容。
 */
export function lookupReadContent(
  readIndex: Map<string, { filePath: string; content: string }>,
  resolvedPath: string
): { filePath: string; content: string } | undefined {
  const key = resolvedPath.replace(/\\/g, "/").toLowerCase();
  const direct = readIndex.get(key);
  if (direct) {
    return direct;
  }
  const base = key.split("/").filter(Boolean).pop();
  if (!base) {
    return undefined;
  }
  for (const [indexKey, value] of readIndex) {
    if (indexKey === base || indexKey.endsWith(`/${base}`)) {
      return value;
    }
  }
  return undefined;
}

/**
 * 扫描会话消息中 Read 工具输出，作为删除前内容兜底。
 */
export function buildReadContentIndex(
  entries: Array<{ parts: Array<{ type: string; tool?: string; state?: { status?: string; input?: unknown; output?: unknown } }> }>
): Map<string, { filePath: string; content: string }> {
  const byKey = new Map<string, { filePath: string; content: string }>();
  for (const entry of entries) {
    for (const part of entry.parts) {
      if (part.type !== "tool" || !part.tool || part.state?.status !== "completed") {
        continue;
      }
      const tool = part.tool.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (tool !== "read") {
        continue;
      }
      const input = (part.state.input ?? {}) as Record<string, unknown>;
      const output = part.state.output;
      if (typeof output !== "string" || !output.trim()) {
        continue;
      }
      let filePath = input.file_path ?? input.filePath ?? input.path;
      if (typeof filePath !== "string" || !filePath.trim()) {
        const pathMatch = output.match(/<path\b[^>]*>([\s\S]*?)<\/path>/i);
        filePath = pathMatch?.[1]?.trim();
      }
      if (typeof filePath !== "string" || !filePath.trim()) {
        continue;
      }
      const key = filePath.replace(/\\/g, "/").toLowerCase();
      byKey.set(key, { filePath: filePath.trim(), content: extractReadToolFileContent(output) });
    }
  }
  return byKey;
}
