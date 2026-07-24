import type { ChatMessage } from "../contracts.js";
import { looksLikeSkillRuntimeEnvelope } from "./skillPromptDisplay.js";

export interface SlashUserDisplay {
  command: string;
  arguments?: string;
  detail?: string;
}

/**
 * 从用户消息字段或正文中解析斜杠命令与附加文字。
 */
export function resolveSlashFromUserMessage(message: ChatMessage): SlashUserDisplay | undefined {
  if (message.role !== "user") {
    return undefined;
  }
  const command = message.slashCommand ?? message.text.trim().match(/^\/(\S+)/)?.[1];
  if (!command) {
    return undefined;
  }
  const args = message.slashArguments?.trim()
    ?? message.text.trim().match(/^\/\S+\s+([\s\S]+)$/)?.[1]?.trim();
  return {
    command,
    ...(args ? { arguments: args } : {}),
    ...(message.slashDetail?.trim() ? { detail: message.slashDetail.trim() } : {})
  };
}

/**
 * 用户气泡是否已有可展示内容。
 */
export function hasUserDisplay(message: ChatMessage): boolean {
  return Boolean(message.text.trim() || message.slashCommand);
}

/**
 * 为斜杠命令 / 技能用户消息补上展示字段。
 */
export function enrichUserSlashDisplay(message: ChatMessage, display: SlashUserDisplay): ChatMessage {
  const args = display.arguments?.trim();
  const text = args ? `/${display.command} ${args}` : `/${display.command}`;
  return {
    ...message,
    text,
    slashCommand: display.command,
    ...(args ? { slashArguments: args } : {}),
    ...(display.detail ? { slashDetail: display.detail } : {})
  };
}

/**
 * 是否为仅含斜杠命令、无附加文字的用户消息。
 */
export function isSoloSlashUserMessage(message: ChatMessage): boolean {
  const slash = resolveSlashFromUserMessage(message);
  if (!slash) {
    return false;
  }
  if (slash.arguments?.trim()) {
    return false;
  }
  if (slash.detail?.trim()) {
    return false;
  }
  const text = message.text.trim();
  return !text || text === `/${slash.command}`;
}

/**
 * 去掉与「同命令 + 带说明」重复出现的单独 `/命令` 气泡。
 */
export function dedupeSlashUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message, index, all) => {
    if (!isSoloSlashUserMessage(message)) {
      return true;
    }
    const soloSlash = resolveSlashFromUserMessage(message);
    if (!soloSlash) {
      return true;
    }
    const hasRicherSibling = all.some((other, otherIndex) => {
      if (otherIndex === index || other.role !== "user") {
        return false;
      }
      const otherSlash = resolveSlashFromUserMessage(other);
      if (!otherSlash || otherSlash.command !== soloSlash.command) {
        return false;
      }
      if (isSoloSlashUserMessage(other)) {
        return false;
      }
      return Math.abs(other.createdAt - message.createdAt) < 15_000;
    });
    return !hasRicherSibling;
  });
}

/**
 * 去掉与斜杠/技能消息同时出现的技能 prompt 正文气泡（Server 有时会单独落一条 text 消息）。
 */
export function filterSkillPromptDuplicateUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message, index, all) => {
    if (message.role !== "user") {
      return true;
    }
    if (resolveSlashFromUserMessage(message)?.command) {
      return true;
    }
    const slashSibling = all.find((other, otherIndex) => {
      if (otherIndex === index || other.role !== "user") {
        return false;
      }
      const slash = resolveSlashFromUserMessage(other);
      if (!slash) {
        return false;
      }
      return Math.abs(other.createdAt - message.createdAt) < 20_000;
    });
    if (!slashSibling) {
      if (looksLikeSkillRuntimeEnvelope(message.text)) {
        return false;
      }
      return true;
    }
    const siblingArgs = resolveSlashFromUserMessage(slashSibling)?.arguments?.trim();
    if (siblingArgs && message.text.includes(siblingArgs)) {
      return false;
    }
    if (looksLikeSkillRuntimeEnvelope(message.text)) {
      return false;
    }
    return true;
  });
}

/**
 * 将本地乐观用户消息内容套用到空的服务端用户消息上。
 */
export function applyOptimisticUserDisplay(serverMessage: ChatMessage, localMessage: ChatMessage): ChatMessage {
  if (serverMessage.role !== "user" || localMessage.role !== "user") {
    return serverMessage;
  }
  if (!hasUserDisplay(localMessage) || hasUserDisplay(serverMessage)) {
    return serverMessage;
  }
  const display = resolveSlashFromUserMessage(localMessage);
  if (display) {
    return enrichUserSlashDisplay(serverMessage, display);
  }
  return {
    ...serverMessage,
    text: localMessage.text.trim(),
    ...(localMessage.slashCommand ? { slashCommand: localMessage.slashCommand } : {}),
    ...(localMessage.slashArguments ? { slashArguments: localMessage.slashArguments } : {}),
    ...(localMessage.slashDetail ? { slashDetail: localMessage.slashDetail } : {})
  };
}

/**
 * 将已补全的斜杠展示从本地状态保留到新一轮 Server 空消息上。
 */
export function preserveUserSlashDisplay(serverMessage: ChatMessage, localMessage: ChatMessage): ChatMessage {
  return applyOptimisticUserDisplay(serverMessage, localMessage);
}

/**
 * 在列表中查找与本地乐观消息时间最接近的空用户消息。
 */
export function findBestEmptyUserIndex(messages: ChatMessage[], local: ChatMessage): number {
  const candidates = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user" && !hasUserDisplay(message));
  if (candidates.length === 0) {
    return -1;
  }
  if (candidates.length === 1) {
    return candidates[0]!.index;
  }
  let best = candidates[0]!;
  let bestDelta = Math.abs(best.message.createdAt - local.createdAt);
  for (const candidate of candidates.slice(1)) {
    const delta = Math.abs(candidate.message.createdAt - local.createdAt);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.index;
}

/**
 * 查找可与本地乐观消息合并的「仅 /命令」服务端用户消息。
 */
export function findAbsorbableSoloSlashIndex(
  messages: ChatMessage[],
  local: ChatMessage,
  display: SlashUserDisplay
): number {
  if (!display.arguments?.trim()) {
    return -1;
  }
  const candidates = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user"
      && isSoloSlashUserMessage(message)
      && resolveSlashFromUserMessage(message)?.command === display.command);
  if (candidates.length === 0) {
    return -1;
  }
  if (candidates.length === 1) {
    return candidates[0]!.index;
  }
  let best = candidates[0]!;
  let bestDelta = Math.abs(best.message.createdAt - local.createdAt);
  for (const candidate of candidates.slice(1)) {
    const delta = Math.abs(candidate.message.createdAt - local.createdAt);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.index;
}

/**
 * 将待发斜杠命令展示套用到最近的空用户消息上。
 */
export function applyPendingSlashDisplays(
  messages: ChatMessage[],
  pending: SlashUserDisplay[]
): { messages: ChatMessage[]; remaining: SlashUserDisplay[] } {
  if (pending.length === 0) {
    return { messages, remaining: [] };
  }
  const queue = [...pending];
  const result = [...messages];
  for (let index = result.length - 1; index >= 0 && queue.length > 0; index -= 1) {
    const message = result[index];
    if (!message || message.role !== "user" || hasUserDisplay(message)) {
      continue;
    }
    const next = queue.pop();
    if (!next) {
      break;
    }
    result[index] = enrichUserSlashDisplay(message, next);
  }
  return { messages: result, remaining: queue };
}

/**
 * 按消息 ID 恢复已知的斜杠命令展示（避免重复刷新后再次变空）。
 */
export function applyStoredSlashDisplays(
  messages: ChatMessage[],
  storedByMessageId: ReadonlyMap<string, SlashUserDisplay>
): ChatMessage[] {
  if (storedByMessageId.size === 0) {
    return messages;
  }
  return messages.map((message) => {
    const stored = storedByMessageId.get(message.id);
    if (!stored || message.role !== "user") {
      return message;
    }
    if (hasUserDisplay(message) && message.slashCommand === stored.command) {
      if (!message.slashArguments?.trim() && stored.arguments?.trim()) {
        return enrichUserSlashDisplay(message, stored);
      }
      return message;
    }
    if (!hasUserDisplay(message)) {
      return enrichUserSlashDisplay(message, stored);
    }
    return message;
  });
}
