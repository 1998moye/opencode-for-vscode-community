import type { ChatMessage } from "../contracts.js";
import {
  applyOptimisticUserDisplay,
  enrichUserSlashDisplay,
  findAbsorbableSoloSlashIndex,
  findBestEmptyUserIndex,
  hasUserDisplay,
  isSoloSlashUserMessage,
  preserveUserSlashDisplay,
  resolveSlashFromUserMessage,
  type SlashUserDisplay
} from "./slashUserDisplay.js";
import { userMessagesSemanticallyEqual } from "./userMessageComparableText.js";

export interface MergeStreamingMessagesResult {
  messages: ChatMessage[];
  /** 已将本地乐观斜杠消息合并进 Server 用户消息。 */
  mergedOptimisticSlash: boolean;
}

function buildSlashDisplayFromLocal(local: ChatMessage): SlashUserDisplay | undefined {
  const resolved = resolveSlashFromUserMessage(local);
  if (!resolved) {
    return undefined;
  }
  return {
    command: resolved.command,
    ...(resolved.arguments ? { arguments: resolved.arguments } : {}),
    ...(resolved.detail ? { detail: resolved.detail } : {})
  };
}

/**
 * 将服务端消息与本地流式增量合并，避免刷新时覆盖尚未落盘的文本。
 */
export function mergeStreamingMessages(
  serverMessages: ChatMessage[],
  localMessages: ChatMessage[]
): MergeStreamingMessagesResult {
  let mergedOptimisticSlash = false;
  const localById = new Map(localMessages.map((message) => [message.id, message]));
  const merged = serverMessages.map((serverMessage) => {
    const local = localById.get(serverMessage.id);
    if (!serverMessage.streaming) {
      return local ? preserveUserSlashDisplay(serverMessage, local) : serverMessage;
    }
    if (!local?.streaming) {
      return local ? preserveUserSlashDisplay(serverMessage, local) : serverMessage;
    }
    if (local.text.length > serverMessage.text.length) {
      return { ...serverMessage, text: local.text, streaming: true };
    }
    return serverMessage;
  });

  for (const local of localMessages) {
    if (local.streaming && !merged.some((message) => message.id === local.id)) {
      merged.push(local);
    }
  }

  for (const local of localMessages) {
    if (!local.id.startsWith("local-") || local.role !== "user" || !hasUserDisplay(local)) {
      continue;
    }
    const emptyServerIndex = findBestEmptyUserIndex(merged, local);
    if (emptyServerIndex !== -1) {
      merged[emptyServerIndex] = applyOptimisticUserDisplay(merged[emptyServerIndex]!, local);
      mergedOptimisticSlash = true;
      continue;
    }
    const display = buildSlashDisplayFromLocal(local);
    if (!display) {
      const hasServerEquivalent = merged.some((message) => message.role === "user"
        && local.text.trim() && userMessagesSemanticallyEqual(message.text, local.text));
      if (!hasServerEquivalent && !merged.some((message) => message.id === local.id)) {
        merged.push(local);
      }
      continue;
    }
    const soloServerIndex = findAbsorbableSoloSlashIndex(merged, local, display);
    if (soloServerIndex !== -1) {
      merged[soloServerIndex] = enrichUserSlashDisplay(merged[soloServerIndex]!, display);
      mergedOptimisticSlash = true;
      continue;
    }
    const hasServerEquivalent = merged.some((message) => message.role === "user" && (
      (display.arguments && resolveSlashFromUserMessage(message)?.command === display.command
        && !isSoloSlashUserMessage(message))
      || (local.text.trim() && userMessagesSemanticallyEqual(message.text, local.text))
    ));
    if (!hasServerEquivalent && !merged.some((message) => message.id === local.id)) {
      merged.push(local);
    }
  }

  return {
    messages: merged.sort((left, right) => left.createdAt - right.createdAt),
    mergedOptimisticSlash
  };
}
