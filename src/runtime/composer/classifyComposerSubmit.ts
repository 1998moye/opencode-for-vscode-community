/**
 * 判断斜杠命令后的文字是否在询问命令/技能本身，而非要求执行。
 */
export function isSlashCommandInquiry(argumentsText: string): boolean {
  const normalized = argumentsText.trim();
  if (!normalized) {
    return false;
  }
  if (/[?？]$/.test(normalized)) {
    return true;
  }
  const patterns = [
    /这(个|种)?\s*(技能|命令|指令)\s*(是\s*)?(干什么的|干嘛的|做什么(的)?|有什么用|干什么|啥意思|什么意思)/,
    /(技能|命令|指令)\s*(是\s*)?(干什么的|干嘛的|做什么(的)?|有什么用|干什么|啥意思|什么意思)/,
    /^(帮我\s*)?(介绍|解释|说明)(一下)?/,
    /怎么用|如何使用|怎样使用/,
    /^(what\s+(is|does)|how\s+(does|do|to\s+use))\b/i,
    /^(explain|describe)\b/i
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export type ComposerSubmit =
  | { kind: "prompt"; text: string }
  | { kind: "slash-command"; command: string; arguments: string; raw: string }
  | { kind: "shell"; command: string; raw: string };

/**
 * 区分普通提示、斜杠命令与 Shell 命令行输入。
 * 若 `/命令` 后是在询问技能用途，则按普通对话发送，避免误触发执行。
 */
export function classifyComposerSubmit(text: string): ComposerSubmit {
  const trimmed = text.trim();
  if (trimmed.startsWith("!")) {
    const command = trimmed.slice(1).trim();
    return { kind: "shell", command, raw: trimmed };
  }
  if (trimmed.startsWith("/")) {
    const match = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (match?.[1]) {
      const argumentsText = match[2]?.trim() ?? "";
      if (argumentsText && isSlashCommandInquiry(argumentsText)) {
        return { kind: "prompt", text: trimmed };
      }
      return {
        kind: "slash-command",
        command: match[1],
        arguments: argumentsText,
        raw: trimmed
      };
    }
  }
  return { kind: "prompt", text: trimmed };
}
