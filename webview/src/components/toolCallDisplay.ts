export interface ToolCallDisplay {
  toolName: string;
  filePath?: string;
  fileName?: string;
  remainingText: string;
}

const TOOL_CALL_PREFIX = /^Called the ([\w.-]+) tool with the following input:\s*/;

/**
 * OpenCode may persist tool calls as plain text. Convert its stable textual
 * envelope into presentation data without changing ordinary assistant text.
 */
export function parseToolCallDisplay(text: string): ToolCallDisplay | undefined {
  const match = text.match(TOOL_CALL_PREFIX);
  if (!match?.[1]) {
    return undefined;
  }
  const inputStart = text.indexOf("{", match[0].length);
  if (inputStart === -1) {
    return undefined;
  }
  const inputEnd = findObjectEnd(text, inputStart);
  if (inputEnd === undefined) {
    return undefined;
  }
  const input = text.slice(inputStart, inputEnd + 1);
  const pathMatch = input.match(/"(?:filePath|path|filename)"\s*:\s*"([^"\r\n]+)"/i);
  const filePath = pathMatch?.[1]?.replace(/\\"/g, '"');
  const fileName = filePath?.replace(/\\/g, "/").split("/").at(-1);
  return {
    toolName: match[1],
    ...(filePath ? { filePath } : {}),
    ...(fileName ? { fileName } : {}),
    remainingText: text.slice(inputEnd + 1).trim()
  };
}

function findObjectEnd(text: string, start: number): number | undefined {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

export interface FileAttachment {
  filePath: string;
  fileName: string;
}

export interface UserMessageDisplay {
  /** 斜杠命令名（不含 /）；非斜杠命令时为 undefined。 */
  slashCommand?: string;
  /** Shell 命令（不含 !）；非 shell 命令时为 undefined。 */
  shellCommand?: string;
  /** 展示用的简短摘要（命令参数或命令正文）。 */
  arguments?: string;
  /** 从正文里解析出的文件附件卡片。 */
  attachments?: FileAttachment[];
  /** 扣除附件前缀后的剩余正文。 */
  remainingText: string;
}

const CALLED_TOOL_PREFIX = /^Called the ([\w.-]+) tool with the following input:\s*/;

/**
 * 把用户消息正文归一为展示数据：斜杠命令、Shell 命令与文件附件前缀。
 * 不改变发送给 OpenCode 的原始文本，仅用于气泡展示。
 */
export function parseUserMessageDisplay(text: string): UserMessageDisplay {
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) {
    const match = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (match?.[1]) {
      return {
        slashCommand: match[1],
        arguments: match[2]?.trim() || undefined,
        remainingText: ""
      };
    }
  }
  if (trimmed.startsWith("!")) {
    const command = trimmed.slice(1).trim();
    return {
      shellCommand: command || undefined,
      remainingText: ""
    };
  }
  // 持久化历史里 OpenCode 可能把工具调用作为文本前缀；抽出一个或多个文件附件卡片。
  let rest = text;
  const attachments: FileAttachment[] = [];
  let guard = 0;
  while (guard < 10) {
    guard += 1;
    const match = rest.match(CALLED_TOOL_PREFIX);
    if (!match) break;
    const inputStart = rest.indexOf("{", match[0].length);
    if (inputStart === -1) break;
    const inputEnd = findObjectEnd(rest, inputStart);
    if (inputEnd === undefined) break;
    const input = rest.slice(inputStart, inputEnd + 1);
    const pathMatch = input.match(/"(?:filePath|path|filename|notebook_path)"\s*:\s*"([^"\r\n]+)"/i);
    const raw = pathMatch?.[1]?.replace(/\\"/g, '"');
    if (raw) {
      const fileName = raw.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? raw;
      attachments.push({ filePath: raw, fileName });
    }
    rest = rest.slice(inputEnd + 1).replace(/^\s+/, "");
  }
  if (attachments.length > 0) {
    return { attachments, remainingText: rest.trim() };
  }
  return { remainingText: text };
}
