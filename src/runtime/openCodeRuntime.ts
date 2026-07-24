import type {
  Locale,
  IntegrationConnectPort,
  OpenCodeBackend,
  OpenCodeConnection,
  OpenCodeIntent,
  OpenCodeRuntime,
  RuntimeNotice
} from "./contracts.js";
import { ConnectionModule } from "./connection/connectionModule.js";
import { CatalogModule } from "./catalog/catalogModule.js";
import { ComposerSuggestionsModule } from "./composer/composerSuggestionsModule.js";
import { classifyComposerSubmit } from "./composer/classifyComposerSubmit.js";
import { validateAttachmentModalities } from "./context/validateAttachmentModalities.js";
import { ContextModule } from "./context/contextModule.js";
import type { ContextResolver } from "./context/contextResolver.js";
import { EventModule } from "./events/eventModule.js";
import { MessageModule } from "./messages/messageModule.js";
import { SessionModule } from "./sessions/sessionModule.js";
import { OpenCodeStateStore } from "./state/openCodeStateStore.js";
import { SessionCoordinator } from "./coordination/sessionCoordinator.js";
import { ChangeReviewModule } from "./changeReview/changeReviewModule.js";

export interface OpenCodeRuntimeOptions {
  trusted: boolean;
  locale: Locale;
  initialDirectory?: string;
  resolveNewSessionDirectory?: () => Promise<string | undefined>;
  backend: OpenCodeBackend;
  notify?: (notice: RuntimeNotice) => void;
  resolveContext?: ContextResolver;
  onContextItemRemoved?: (item: import("./contracts.js").ContextItem) => void;
}

export function createOpenCodeRuntime(options: OpenCodeRuntimeOptions): OpenCodeRuntime {
  const state = new OpenCodeStateStore(options.locale, options.trusted);
  const connection = new ConnectionModule(state, options.backend, options.trusted);
  const catalog = new CatalogModule(state, () => connection.current);
  const composerSuggestions = new ComposerSuggestionsModule(state, () => connection.current, () => options.initialDirectory);
  const context = new ContextModule(state);
  const sessions = new SessionModule(state, () => connection.current, catalog);
  const messages = new MessageModule(
    state,
    () => connection.current,
    (text, contextParts) => {
      const classified = classifyComposerSubmit(text);
      const options = { ...catalog.messageOptions(), contextParts };
      switch (classified.kind) {
        case "slash-command":
          return {
            kind: "slash-command",
            ...options,
            command: classified.command,
            arguments: classified.arguments,
            raw: classified.raw
          };
        case "shell":
          return {
            kind: "shell",
            ...options,
            command: classified.command,
            raw: classified.raw
          };
        default:
          return { kind: "prompt", ...options, text: classified.text };
      }
    }
  );
  const changeReview = new ChangeReviewModule(state, () => connection.current);
  const baseNotify = options.notify ?? (() => undefined);
  const coordinator = new SessionCoordinator(state, (notice) => {
    if (notice.type === "session-completed") {
      void changeReview.refresh(notice.sessionId);
    }
    baseNotify(notice);
  });
  const events = new EventModule(state, sessions, messages, catalog, coordinator, changeReview);
  let disposeEventSubscription: (() => void) | undefined;
  let eventQueue = Promise.resolve();
  let activeInitialize: Promise<void> | undefined;
  const submittingPermissionIds = new Set<string>();
  const submittingQuestionIds = new Set<string>();

  const SESSION_LOAD_TIMEOUT_MS = 30_000;

  const clearEventSubscription = (): void => {
    disposeEventSubscription?.();
    disposeEventSubscription = undefined;
  };

  const ensureEventSubscription = (connected: OpenCodeConnection): void => {
    if (disposeEventSubscription) {
      return;
    }
    disposeEventSubscription = connected.subscribe((event) => {
      if (event.type === "permission-requested" || event.type === "permission-resolved" || event.type === "question-requested" || event.type === "question-resolved") {
        void events.handle(event).catch((error) => {
          state.update({ error: error instanceof Error ? error.message : "Failed to handle OpenCode event." });
          /*
          state.update({ error: error instanceof Error ? error.message : "澶勭悊 OpenCode 浜嬩欢澶辫触銆? });
          */
        });
        return;
      }
      eventQueue = eventQueue
        .then(() => events.handle(event))
        .catch((error) => {
          state.update({ error: error instanceof Error ? error.message : "Failed to handle OpenCode event." });
          /*
          state.update({ error: error instanceof Error ? error.message : "处理 OpenCode 事件失败。" });
          */
        });
    });
  };

  const loadSessionsWithTimeout = async (): Promise<void> => {
    await Promise.race([
      sessions.refresh(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("加载 OpenCode 会话列表超时。")), SESSION_LOAD_TIMEOUT_MS);
      })
    ]);
  };

  const completeConnectionSetup = async (): Promise<void> => {
    const connected = connection.current;
    if (!connected) {
      return;
    }
    ensureEventSubscription(connected);
    const [, initialStatuses, pendingPermissions, pendingQuestions] = await Promise.all([
      loadSessionsWithTimeout(),
      connected.listSessionStatuses?.().catch(() => ({})) ?? Promise.resolve({}),
      connected.listPendingPermissions?.().catch(() => []) ?? Promise.resolve([]),
      connected.listPendingQuestions?.().catch(() => []) ?? Promise.resolve([])
    ]);
    const active = state.current.sessions.find((session) => session.id === state.current.activeSessionId);
    for (const [sessionId, status] of Object.entries(initialStatuses)) {
      coordinator.handleServerStatus(sessionId, status);
    }
    events.replacePermissions(pendingPermissions);
    events.replaceQuestions(pendingQuestions);
    state.update({ phase: "ready", error: undefined });
    try {
      await catalog.refresh(active?.directory ?? options.initialDirectory);
      if (active) {
        catalog.applySessionSelection(active);
      } else {
        catalog.restoreRecentSessionPreference(state.current.sessions, options.initialDirectory);
        if (Object.keys(state.current.composerPreference).length > 0) {
          state.update({ composerSelection: { ...state.current.composerPreference } });
          catalog.revalidateSelection();
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "模型目录加载失败";
      state.update({
        catalog: {
          ...state.current.catalog,
          loaded: true,
          error: detail
        }
      });
    }
  };

  const initializeInternal = async (): Promise<void> => {
    clearEventSubscription();
    try {
      await connection.dispose();
    } finally {
      coordinator.connectionLost();
    }
    state.update({ sessionStatuses: {}, busySessionIds: [], permissions: [], questions: [] });
    const connected = await connection.initialize(options.initialDirectory);
    if (!connected) {
      return;
    }
    try {
      await completeConnectionSetup();
    } catch (error) {
      clearEventSubscription();
      await connection.dispose().catch(() => undefined);
      const detail = error instanceof Error ? error.message : "未知错误";
      state.update({
        phase: "error",
        connection: {
          ...state.current.connection,
          status: "disconnected",
          ownership: undefined,
          serverVersion: undefined,
          topology: undefined
        },
        error: `加载 OpenCode 会话列表失败：${detail}`
      });
    }
  };

  const initialize = async (): Promise<void> => {
    connection.cancelInitialize();
    state.update({ error: undefined });
    const promise = initializeInternal();
    activeInitialize = promise;
    await promise;
  };

  const resumeInterruptedSetup = async (): Promise<void> => {
    if (state.current.phase === "ready") {
      return;
    }
    if (state.current.phase !== "connecting" || state.current.connection.status !== "connected" || !connection.current) {
      return;
    }
    try {
      await completeConnectionSetup();
    } catch (error) {
      clearEventSubscription();
      await connection.dispose().catch(() => undefined);
      const detail = error instanceof Error ? error.message : "未知错误";
      state.update({
        phase: "error",
        connection: {
          ...state.current.connection,
          status: "disconnected",
          ownership: undefined,
          serverVersion: undefined,
          topology: undefined
        },
        error: `恢复 OpenCode 连接失败：${detail}`
      });
    }
  };

  const sendMessage = async (text: string): Promise<void> => {
    const hasAttachments = state.current.contextItems.some((item) => item.kind === "image" || item.kind === "pdf" || item.kind === "attachment");
    if (!text.trim() && !hasAttachments) {
      return;
    }
    let optimisticMessageId: string | undefined;
    const previousDraft = state.current.draft;
    if (!state.current.activeSessionId) {
      let directory: string | undefined;
      try {
        directory = await options.resolveNewSessionDirectory?.();
      } catch (error) {
        state.update({ error: error instanceof Error ? error.message : "无法确定新会话工作目录。" });
        return;
      }
      if (!directory) {
        state.update({ error: "首次发送消息前需要选择会话工作目录。" });
        return;
      }
      optimisticMessageId = messages.appendOptimisticUserMessage(text);
      try {
        await sessions.create(directory);
      } catch (error) {
        if (optimisticMessageId) {
          messages.removeOptimisticMessage(optimisticMessageId);
        }
        state.update({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "创建 OpenCode 会话失败。"
        });
        return;
      }
      if (optimisticMessageId && state.current.activeSessionId) {
        messages.bindOptimisticMessage(optimisticMessageId, state.current.activeSessionId);
      }
    }
    const session = state.current.sessions.find((candidate) => candidate.id === state.current.activeSessionId);
    if (!session) {
      return;
    }
    if (!coordinator.begin(session)) {
      state.update({ draft: text });
      return;
    }
    const modalityCheck = validateAttachmentModalities(
      state.current.contextItems,
      state.current.catalog,
      state.current.composerSelection
    );
    if (!modalityCheck.ok) {
      state.update({ draft: text, error: modalityCheck.error });
      await coordinator.markSendRejected(session.id, modalityCheck.error);
      return;
    }
    const manualItems = state.current.contextItems.filter((item) => !item.auto);
    let contextParts: import("./contracts.js").ContextPartInput[] | undefined;
    if (options.resolveContext && state.current.contextItems.length > 0) {
      const resolved = await options.resolveContext(state.current.contextItems);
      context.applyResolved(resolved.items);
      if (resolved.blocked) {
        state.update({
          draft: text,
          error: resolved.error ?? "部分上下文无法发送，请检查上下文项。"
        });
        await coordinator.markSendRejected(session.id, resolved.error);
        return;
      }
      contextParts = resolved.parts;
    }
    if (!await messages.send(text, contextParts, { skipOptimistic: Boolean(optimisticMessageId) })) {
      await coordinator.markSendRejected(session.id, state.current.error);
      return;
    }
    for (const item of manualItems) {
      options.onContextItemRemoved?.(item);
    }
    context.clearAfterSend();
  };

  const respondToPermission = async (
    requestId: string,
    reply: import("./contracts.js").PermissionReply
  ): Promise<void> => {
    if (submittingPermissionIds.has(requestId)) {
      return;
    }
    const pending = state.current.permissions ?? [];
    const request = pending.find((candidate) => candidate.id === requestId);
    const connected = connection.current;
    if (!request || !connected?.respondToPermission) {
      return;
    }
    submittingPermissionIds.add(requestId);
    state.update({
      permissions: pending.map((candidate) => candidate.id === requestId
        ? { ...candidate, status: "submitting" as const }
        : candidate)
    });
    try {
      await connected.respondToPermission(request, reply);
      await events.handle({ type: "permission-resolved", sessionId: request.sessionId, requestId });
    } catch (error) {
      state.update({
        permissions: (state.current.permissions ?? []).map((candidate) => candidate.id === requestId
          ? { ...candidate, status: "pending" as const }
          : candidate),
        error: error instanceof Error ? error.message : "OpenCode 未能处理授权回复。"
      });
    } finally {
      submittingPermissionIds.delete(requestId);
    }
  };

  const submitQuestion = async (requestId: string, answers: string[][] | undefined): Promise<void> => {
    if (submittingQuestionIds.has(requestId)) {
      return;
    }
    const pending = state.current.questions ?? [];
    const request = pending.find((candidate) => candidate.id === requestId);
    const connected = connection.current;
    if (!request || !connected || (answers ? !connected.respondToQuestion : !connected.rejectQuestion)) {
      return;
    }
    submittingQuestionIds.add(requestId);
    state.update({
      questions: pending.map((candidate) => candidate.id === requestId
        ? { ...candidate, status: "submitting" as const }
        : candidate)
    });
    try {
      if (answers) {
        await connected.respondToQuestion(request, answers);
      } else {
        await connected.rejectQuestion(request);
      }
      await events.handle({ type: "question-resolved", sessionId: request.sessionId, requestId });
    } catch (error) {
      state.update({
        questions: (state.current.questions ?? []).map((candidate) => candidate.id === requestId
          ? { ...candidate, status: "pending" as const }
          : candidate),
        error: error instanceof Error ? error.message : "OpenCode 未能提交问题回答。"
      });
    } finally {
      submittingQuestionIds.delete(requestId);
    }
  };

  const revertSessionMessage = async (messageId: string): Promise<boolean> => {
    const connected = connection.current;
    const sessionId = state.current.activeSessionId;
    if (!connected?.revertSessionMessage || !sessionId) {
      return false;
    }
    const session = state.current.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      return false;
    }
    await connected.revertSessionMessage(session, messageId);
    await messages.refresh(sessionId);
    await changeReview.refresh(sessionId);
    return true;
  };

  return {
    async dispatch(intent: OpenCodeIntent): Promise<void> {
      switch (intent.type) {
        case "initialize":
          await initialize();
          break;
        case "select-session":
          if (state.current.activeSessionId && state.current.activeSessionId !== intent.sessionId
            && coordinator.isLocallyDriven(state.current.activeSessionId)) {
            const interruptedSessionId = await messages.abort();
            if (interruptedSessionId) {
              coordinator.interrupt(interruptedSessionId);
            }
          }
          await sessions.select(intent.sessionId);
          await changeReview.refresh(intent.sessionId);
          break;
        case "create-session":
          await sessions.create(intent.directory);
          break;
        case "rename-session":
          await sessions.rename(intent.sessionId, intent.title);
          break;
        case "delete-session":
          if (await sessions.delete(intent.sessionId)) {
            await coordinator.removeSession(intent.sessionId);
          }
          break;
        case "share-session":
          await sessions.share(intent.sessionId);
          break;
        case "unshare-session":
          await sessions.unshare(intent.sessionId);
          break;
        case "send-message":
          await sendMessage(intent.text);
          break;
        case "abort-session":
          {
            const sessionId = await messages.abort();
            if (sessionId) {
              coordinator.interrupt(sessionId);
            }
          }
          break;
        case "respond-permission":
          await respondToPermission(intent.requestId, intent.reply);
          break;
        case "respond-question":
          await submitQuestion(intent.requestId, intent.answers);
          break;
        case "reject-question":
          await submitQuestion(intent.requestId, undefined);
          break;
        case "update-draft":
          state.update({ draft: intent.draft });
          break;
        case "update-composer-selection":
          await catalog.updateSelection(intent.selection);
          break;
        case "add-context-item":
          context.add(intent.item);
          break;
        case "remove-context-item": {
          const removed = state.current.contextItems.find((item) => item.id === intent.itemId);
          context.remove(intent.itemId);
          if (removed) {
            options.onContextItemRemoved?.(removed);
          }
          break;
        }
        case "sync-auto-selection":
          context.syncAutoSelection(intent.item ?? undefined);
          break;
        case "query-composer-suggestions":
          await composerSuggestions.query(intent.requestId, intent.trigger, intent.query);
          break;
        case "run-cli-command":
          // The surface host executes CLI commands; they never go to Server command.
          break;
        case "dismiss-composer-suggestions":
          composerSuggestions.reset();
          break;
        case "set-attachment-notice":
          state.update({ attachmentNotice: intent.notice });
          break;
        case "dismiss-attachment-notice":
          state.update({ attachmentNotice: undefined });
          break;
        case "refresh-change-review":
          await changeReview.refresh();
          break;
        case "dismiss-change-review-entry":
          changeReview.dismissEntry(intent.filePath);
          break;
        case "dismiss-all-change-review-entries":
          changeReview.dismissAllEntries();
          break;
        case "open-change-diff":
        case "revert-change-file":
        case "revert-all-change-files":
        case "revert-assistant-message-changes":
          break;
      }
    },
    subscribe(listener): () => void {
      return state.subscribe(listener);
    },
    async syncSurface(): Promise<void> {
      if (activeInitialize) {
        await activeInitialize.catch(() => undefined);
      }
      await resumeInterruptedSetup();
      state.resync();
    },
    getIntegrationPort(): IntegrationConnectPort | undefined {
      return connection.current?.integrations;
    },
    getMcpPort() {
      return connection.current?.mcp;
    },
    getSkillPort() {
      return connection.current?.skills;
    },
    revertSessionMessage,
    async dispose(): Promise<void> {
      clearEventSubscription();
      state.clearListeners();
      await eventQueue;
      try {
        await connection.dispose();
      } finally {
        coordinator.dispose();
      }
    }
  };
}

export type { OpenCodeRuntime, OpenCodeState } from "./contracts.js";
