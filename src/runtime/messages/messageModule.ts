import type { ChatMessage, OpenCodeConnection, SendMessageRequest } from "../contracts.js";
import { classifyComposerSubmit } from "../composer/classifyComposerSubmit.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";
import { mergeStreamingMessages } from "./mergeStreamingMessages.js";
import {
  applyPendingSlashDisplays,
  applyStoredSlashDisplays,
  dedupeSlashUserMessages,
  filterSkillPromptDuplicateUserMessages,
  hasUserDisplay,
  type SlashUserDisplay
} from "./slashUserDisplay.js";

const STREAM_FLUSH_MS = 16;

export class MessageModule {
  readonly #pendingDeltas = new Map<string, string>();
  readonly #pendingSlashBySession = new Map<string, SlashUserDisplay[]>();
  readonly #storedSlashByMessageId = new Map<string, SlashUserDisplay>();
  #flushTimer: ReturnType<typeof setTimeout> | undefined;
  #flushSessionId: string | undefined;

  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly connection: () => OpenCodeConnection | undefined,
    private readonly composeRequest: (text: string, contextParts?: import("../contracts.js").ContextPartInput[]) => SendMessageRequest
  ) {}

  async refresh(sessionId: string): Promise<void> {
    const connection = this.connection();
    if (!connection || this.state.current.activeSessionId !== sessionId) {
      return;
    }
    const session = this.state.current.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      return;
    }
    const serverMessages = await connection.listMessages(session);
    for (const message of serverMessages) {
      if (!message.streaming) {
        this.#pendingDeltas.delete(message.id);
      }
    }
    const { messages: mergedMessages, mergedOptimisticSlash } = mergeStreamingMessages(
      serverMessages,
      this.state.current.messages
    );
    let messages = mergedMessages;
    let pending = [...(this.#pendingSlashBySession.get(sessionId) ?? [])];
    if (mergedOptimisticSlash && pending.length > 0) {
      pending.pop();
    }
    if (!mergedOptimisticSlash && pending.length > 0) {
      const applied = applyPendingSlashDisplays(messages, pending);
      messages = applied.messages;
      pending = applied.remaining;
    }
    if (pending.length > 0) {
      this.#pendingSlashBySession.set(sessionId, pending);
    } else {
      this.#pendingSlashBySession.delete(sessionId);
    }
    messages = filterSkillPromptDuplicateUserMessages(
      dedupeSlashUserMessages(applyStoredSlashDisplays(messages, this.#storedSlashByMessageId))
    );
    for (const message of messages) {
      if (message.role === "user" && message.slashCommand && hasUserDisplay(message)) {
        this.#rememberStoredSlash(message);
      }
    }
    this.state.update({ messages });
  }

  applyTextDelta(sessionId: string, messageId: string, delta: string): void {
    if (!delta || this.state.current.activeSessionId !== sessionId) {
      return;
    }
    this.#pendingDeltas.set(messageId, `${this.#pendingDeltas.get(messageId) ?? ""}${delta}`);
    this.#flushSessionId = sessionId;
    if (!this.#flushTimer) {
      this.#flushTimer = setTimeout(() => {
        this.#flushTimer = undefined;
        const activeSessionId = this.#flushSessionId;
        this.#flushSessionId = undefined;
        if (!activeSessionId || activeSessionId !== this.state.current.activeSessionId) {
          this.#pendingDeltas.clear();
          return;
        }
        this.#flushPendingDeltas(activeSessionId);
      }, STREAM_FLUSH_MS);
    }
  }

  /**
   * 在文本流结束时写入最终正文并清除流式状态。
   */
  finalizeText(sessionId: string, messageId: string, text: string): void {
    if (this.state.current.activeSessionId !== sessionId) {
      return;
    }
    this.#pendingDeltas.delete(messageId);
    const messages = [...this.state.current.messages];
    const index = messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      messages.push({
        id: messageId,
        sessionId,
        role: "assistant",
        text,
        createdAt: Date.now()
      });
    } else {
      const current = messages[index];
      if (!current) {
        return;
      }
      const { streaming: _streaming, ...rest } = current;
      messages[index] = { ...rest, text };
    }
    this.state.update({ messages });
  }

  /**
   * 首条消息创建会话前，先把用户气泡展示出来，避免等待 API 往返。
   */
  appendOptimisticUserMessage(text: string, sessionId = "pending"): string {
    const trimmed = text.trim() || "（附件）";
    const classified = classifyComposerSubmit(trimmed);
    const slashMatch = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      sessionId,
      role: "user",
      text: trimmed,
      createdAt: Date.now(),
      ...(classified.kind === "slash-command"
        ? {
          slashCommand: classified.command,
          ...(classified.arguments ? { slashArguments: classified.arguments } : {})
        }
        : slashMatch?.[1]
          ? {
            slashCommand: slashMatch[1],
            ...(slashMatch[2]?.trim() ? { slashArguments: slashMatch[2].trim() } : {})
          }
          : {})
    };
    this.state.update({
      messages: [...this.state.current.messages, optimistic],
      draft: "",
      error: undefined
    });
    return optimistic.id;
  }

  /**
   * 会话创建完成后，把占位 sessionId 改成真实 id。
   */
  bindOptimisticMessage(messageId: string, sessionId: string): void {
    this.state.update({
      messages: this.state.current.messages.map((message) => message.id === messageId
        ? { ...message, sessionId }
        : message)
    });
  }

  removeOptimisticMessage(messageId: string): void {
    this.state.update({
      messages: this.state.current.messages.filter((message) => message.id !== messageId)
    });
  }

  async send(
    textValue: string,
    contextParts?: import("../contracts.js").ContextPartInput[],
    options?: { skipOptimistic?: boolean }
  ): Promise<boolean> {
    const connection = this.connection();
    const session = this.state.current.sessions.find(
      (candidate) => candidate.id === this.state.current.activeSessionId
    );
    const text = textValue.trim();
    const hasFileParts = (contextParts?.length ?? 0) > 0;
    if (!connection || !session || (!text && !hasFileParts)) {
      return false;
    }

    const previousDraft = this.state.current.draft;
    const request = this.composeRequest(text, contextParts);
    if (!options?.skipOptimistic) {
      this.appendOptimisticUserMessage(text || "（附件）", session.id);
    }
    if (request.kind === "slash-command") {
      const pending = this.#pendingSlashBySession.get(session.id) ?? [];
      pending.push({
        command: request.command,
        ...(request.arguments ? { arguments: request.arguments } : {})
      });
      this.#pendingSlashBySession.set(session.id, pending);
    }

    try {
      await connection.sendMessage(session, request);
      return true;
    } catch (error) {
      if (request.kind === "slash-command") {
        const pending = this.#pendingSlashBySession.get(session.id) ?? [];
        if (pending.length > 0) {
          pending.pop();
          if (pending.length === 0) {
            this.#pendingSlashBySession.delete(session.id);
          } else {
            this.#pendingSlashBySession.set(session.id, pending);
          }
        }
      }
      if (options?.skipOptimistic) {
        this.state.update({ draft: previousDraft || text });
      } else {
        const last = this.state.current.messages.at(-1);
        if (last?.id.startsWith("local-") && last.role === "user") {
          this.removeOptimisticMessage(last.id);
        }
        this.state.update({ draft: previousDraft || text });
      }
      this.state.update({
        error: error instanceof Error ? error.message : "发送消息失败"
      });
      return false;
    }
  }

  async abort(): Promise<string | undefined> {
    const connection = this.connection();
    const session = this.state.current.sessions.find(
      (candidate) => candidate.id === this.state.current.activeSessionId
    );
    if (!connection || !session || !this.state.current.busySessionIds.includes(session.id)) {
      return undefined;
    }
    await connection.abortSession(session);
    return session.id;
  }

  #rememberStoredSlash(message: ChatMessage): void {
    if (!message.slashCommand) {
      return;
    }
    this.#storedSlashByMessageId.set(message.id, {
      command: message.slashCommand,
      ...(message.slashArguments?.trim()
        ? { arguments: message.slashArguments.trim() }
        : message.text.match(/^\/\S+\s+([\s\S]+)$/)?.[1]?.trim()
          ? { arguments: message.text.match(/^\/\S+\s+([\s\S]+)$/)![1]!.trim() }
          : {}),
      ...(message.slashDetail ? { detail: message.slashDetail } : {})
    });
  }

  #flushPendingDeltas(sessionId: string): void {
    if (this.#pendingDeltas.size === 0) {
      return;
    }
    const deltas = new Map(this.#pendingDeltas);
    this.#pendingDeltas.clear();
    const messages = [...this.state.current.messages];

    for (const [messageId, delta] of deltas) {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index === -1) {
        messages.push({
          id: messageId,
          sessionId,
          role: "assistant",
          text: delta,
          createdAt: Date.now(),
          streaming: true
        });
        continue;
      }
      const current = messages[index];
      if (!current) {
        continue;
      }
      messages[index] = {
        ...current,
        text: `${current.text}${delta}`,
        streaming: true
      };
    }

    this.state.update({ messages });
  }
}
