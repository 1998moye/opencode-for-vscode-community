/**
 * 判断文本是否为技能 prompt 模板正文（应隐藏，不作为用户气泡展示）。
 */
export function looksLikeSkillPromptBody(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/\n#{1,6}\s/m.test(trimmed)) {
    return true;
  }
  if (/^create or update\b/i.test(trimmed)) {
    return true;
  }
  if (/^you are\b/i.test(trimmed)) {
    return true;
  }
  if (/^your job is\b/i.test(trimmed)) {
    return true;
  }
  if (/^goal:\s*/im.test(trimmed)) {
    return true;
  }
  if (/^two-axis review\b/i.test(trimmed)) {
    return true;
  }
  if (/^interview me relentlessly\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * OpenCode 执行技能时注入的运行时信封（含 base directory 等），不应展示为用户气泡。
 */
export function looksLikeSkillRuntimeEnvelope(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (looksLikeSkillPromptBody(trimmed)) {
    return true;
  }
  if (/base directory for this skill\b/i.test(trimmed)) {
    return true;
  }
  if (/relative paths in this skill\b/i.test(trimmed)) {
    return true;
  }
  if (/^run a [`'"]?\//i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * 从技能信封文本末尾提取用户附加说明（路径、问题等）。
 */
export function extractTrailingUserArgsFromSkillEnvelope(text: string): string | undefined {
  if (!looksLikeSkillRuntimeEnvelope(text)) {
    return undefined;
  }
  const lines = text.trim().split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!looksLikeUserSuppliedArgLine(line)) {
      continue;
    }
    if (/^\/\S+/.test(line)) {
      const match = line.match(/^\/\S+\s+([\s\S]+)$/);
      return (match?.[1] ?? line).trim() || undefined;
    }
    return line;
  }
  return undefined;
}

function looksLikeUserSuppliedArgLine(line: string): boolean {
  if (/^[-*]\s/.test(line) || /^#{1,6}\s/.test(line)) {
    return false;
  }
  if (/^run a\b/i.test(line) || /base directory for this skill\b/i.test(line) || /relative paths in this skill\b/i.test(line)) {
    return false;
  }
  if (/^create or update\b/i.test(line) || /^you are\b/i.test(line) || /^your job is\b/i.test(line)) {
    return false;
  }
  if (/[?？]$/.test(line)) {
    return true;
  }
  if (/[a-z]:\\/i.test(line) || /^\/[\w./-]+/.test(line)) {
    return true;
  }
  if (/^\/\S+\s+/.test(line)) {
    return true;
  }
  if (/[\u4e00-\u9fff]/.test(line)) {
    return true;
  }
  return false;
}

/**
 * 是否应隐藏该用户消息正文（技能模板或运行时信封）。
 */
export function shouldHideSkillBackedUserText(text: string): boolean {
  return looksLikeSkillRuntimeEnvelope(text);
}
