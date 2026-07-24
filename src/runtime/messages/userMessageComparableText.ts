const CALLED_TOOL_PREFIX = /^Called the ([\w.-]+) tool with the following input:\s*/;

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

/**
 * 用于合并乐观用户消息：去掉 OpenCode 持久化的「Called the … tool」文件上下文前缀，只比较用户正文。
 */
export function userMessageComparableText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) {
    const match = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (match?.[1]) {
      return (match[2]?.trim() ?? "").trim();
    }
  }
  if (trimmed.startsWith("!")) {
    return trimmed.slice(1).trim();
  }
  let rest = text;
  let guard = 0;
  while (guard < 10) {
    guard += 1;
    const match = rest.match(CALLED_TOOL_PREFIX);
    if (!match) {
      break;
    }
    const inputStart = rest.indexOf("{", match[0].length);
    if (inputStart === -1) {
      break;
    }
    const inputEnd = findObjectEnd(rest, inputStart);
    if (inputEnd === undefined) {
      break;
    }
    rest = rest.slice(inputEnd + 1).replace(/^\s+/, "");
  }
  return rest.trim();
}

/**
 * 判断两条用户消息正文是否语义相同（含「纯文字」与「文件附件前缀 + 文字」）。
 */
export function userMessagesSemanticallyEqual(left: string, right: string): boolean {
  const leftKey = userMessageComparableText(left);
  const rightKey = userMessageComparableText(right);
  if (leftKey && rightKey) {
    return leftKey === rightKey;
  }
  return left.trim() === right.trim();
}
