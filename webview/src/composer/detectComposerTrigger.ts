export interface ComposerTrigger {
  trigger: "slash" | "mention";
  query: string;
  start: number;
  end: number;
}

/**
 * 检测光标前的 `/` 或 `@` 触发片段。
 */
export function detectComposerTrigger(value: string, cursor: number): ComposerTrigger | undefined {
  const before = value.slice(0, cursor);
  const slash = before.match(/(?:^|\s)\/([^\s]*)$/);
  if (slash?.index !== undefined) {
    const start = slash.index + (slash[0].startsWith("/") ? 0 : 1);
    return {
      trigger: "slash",
      query: slash[1] ?? "",
      start,
      end: cursor
    };
  }
  const mention = before.match(/(?:^|\s)@([^\s]*)$/);
  if (mention?.index !== undefined) {
    const start = mention.index + (mention[0].startsWith("@") ? 0 : 1);
    return {
      trigger: "mention",
      query: mention[1] ?? "",
      start,
      end: cursor
    };
  }
  return undefined;
}

/**
 * 用候选项替换触发片段并返回新草稿与光标位置。
 */
export function applyComposerSuggestion(
  value: string,
  trigger: ComposerTrigger,
  insertText: string
): { draft: string; cursor: number } {
  const draft = `${value.slice(0, trigger.start)}${insertText}${value.slice(trigger.end)}`;
  const cursor = trigger.start + insertText.length;
  return { draft, cursor };
}
