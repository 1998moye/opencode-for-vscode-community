import {
  createOpencodeClient,
  type GlobalEvent,
  type OpencodeClient
} from "@opencode-ai/sdk/v2";
import type {
  ConnectionCapabilities,
  ConnectionTopology,
  ComposerSelection,
  ComposerSuggestionItem,
  McpPort,
  SkillPort,
  McpServerStatus,
  ModelCatalog,
  OpenCodeConnection,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
  RuntimeEvent,
  SendMessageRequest,
  SessionSummary
} from "../../runtime/contracts.js";
import { createAuthenticatedFetch } from "../http/authenticatedFetch.js";
import type { ManagedServerHandle } from "../server/managedServer.js";
import { mapOpenCodeMessage, readOpenCodeErrorMessage } from "./messageMapper.js";
import { PartTypeRegistry } from "./partTypeRegistry.js";
import { clearMessageRefreshThrottle, scheduleThrottledMessageRefresh, type MessageRefreshThrottleState } from "./messageRefreshThrottle.js";
import { createSessionParameters } from "./sessionCreateRequest.js";
import type { PathMapping } from "../topology/connectionTopology.js";
import { inspectConnectionCapabilities } from "./connectionCapabilitiesProbe.js";
import { dataOf } from "./sdkRequest.js";
import { mapContextParts } from "./contextPartMapper.js";
import { mapSession } from "./sessionMapper.js";
import { fetchModelCatalog } from "./fetchModelCatalog.js";
import { fetchSlashCommands } from "./fetchSlashCommands.js";
import { fetchSkills } from "./fetchSkills.js";
import { isExcludedSlashCommand, mergeSkillSlashSuggestions } from "../../runtime/composer/slashCommandCatalog.js";
import { searchComposerMentions } from "./searchComposerMentions.js";
import { SdkIntegrationConnectPort } from "./integrationConnectPort.js";
import {
  fetchDefaultComposerSelection,
  persistDefaultComposerSelection
} from "./configComposerSelection.js";
import { fetchSessionChangeLedger } from "./fetchSessionChangeLedger.js";

export async function createSdkConnection(options: {
  baseUrl: string;
  username: string;
  password: string;
  ownership: "managed" | "external";
  topology: ConnectionTopology;
  localDirectory?: string | undefined;
  pathMappings: PathMapping[];
  managedServer?: ManagedServerHandle;
}): Promise<OpenCodeConnection> {
  const client = createOpencodeClient({
    baseUrl: options.baseUrl,
    fetch: createAuthenticatedFetch(options.username, options.password)
  });
  let health: { healthy: boolean; version: string };
  try {
    health = await dataOf(client.global.health());
  } catch (error) {
    throw new Error(`OpenCode Server 健康检查或认证失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
  const capabilities = await inspectConnectionCapabilities(client, options);
  return new SdkConnection(
    client,
    health.version,
    options.ownership,
    options.topology,
    capabilities,
    options.managedServer
  );
}

class SdkConnection implements OpenCodeConnection {
  readonly #listeners = new Set<(event: RuntimeEvent) => void>();
  readonly #abortController = new AbortController();
  readonly #ownedSessionIds = new Set<string>();
  readonly #messageRefreshStates = new Map<string, MessageRefreshThrottleState>();
  readonly #partTypes = new PartTypeRegistry();
  readonly integrations: SdkIntegrationConnectPort;
  readonly mcp: McpPort;
  readonly skills: SkillPort;
  #eventLoop: Promise<void> | undefined;

  constructor(
    private readonly client: OpencodeClient,
    readonly serverVersion: string,
    readonly ownership: "managed" | "external",
    readonly topology: ConnectionTopology,
    readonly capabilities: ConnectionCapabilities,
    private readonly managedServer: ManagedServerHandle | undefined
  ) {
    this.integrations = new SdkIntegrationConnectPort(client);
    this.mcp = {
      list: async (directory) => {
        const statuses = await dataOf(client.mcp.status(directory ? { directory } : undefined));
        return Object.entries(statuses).map(([name, status]) => mapMcpStatus(name, status));
      },
      connect: async (name, directory) => {
        await dataOf(client.mcp.connect({ name, ...(directory ? { directory } : {}) }));
      },
      disconnect: async (name, directory) => {
        await dataOf(client.mcp.disconnect({ name, ...(directory ? { directory } : {}) }));
      }
    };
    this.skills = {
      list: async (directory) => fetchSkills(client, directory)
    };
  }

  async listSessions(): Promise<SessionSummary[]> {
    const sessions = await dataOf(this.client.session.list({ limit: 200 }));
    return sessions.map(mapSession).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listSessionStatuses(): Promise<Record<string, "idle" | "busy" | "retry">> {
    const statuses = await dataOf(this.client.session.status());
    return Object.fromEntries(Object.entries(statuses).map(([sessionId, status]) => [sessionId, status.type]));
  }

  async listPendingPermissions(): Promise<PermissionRequest[]> {
    try {
      const response = await dataOf(this.client.v2.permission.request.list());
      return response.data.map((request) => mapV2Permission(request));
    } catch {
      const requests = await dataOf(this.client.permission.list());
      return requests.map((request) => mapLegacyPermission(request));
    }
  }

  async respondToPermission(request: PermissionRequest, reply: PermissionReply): Promise<void> {
    if (request.transport === "legacy") {
      await dataOf(this.client.permission.reply({ requestID: request.id, reply }));
      return;
    }
    await dataOf(this.client.v2.session.permission.reply({
      sessionID: request.sessionId,
      requestID: request.id,
      reply
    }));
  }

  async listPendingQuestions(): Promise<QuestionRequest[]> {
    try {
      const response = await dataOf(this.client.v2.question.request.list());
      return response.data.map((request) => mapV2Question(request));
    } catch {
      const requests = await dataOf(this.client.question.list());
      return requests.map((request) => mapLegacyQuestion(request));
    }
  }

  async respondToQuestion(request: QuestionRequest, answers: string[][]): Promise<void> {
    if (request.transport === "legacy") {
      await dataOf(this.client.question.reply({ requestID: request.id, answers }));
      return;
    }
    await dataOf(this.client.v2.session.question.reply({
      sessionID: request.sessionId,
      requestID: request.id,
      questionV2Reply: { answers }
    }));
  }

  async rejectQuestion(request: QuestionRequest): Promise<void> {
    if (request.transport === "legacy") {
      await dataOf(this.client.question.reject({ requestID: request.id }));
      return;
    }
    await dataOf(this.client.v2.session.question.reject({
      sessionID: request.sessionId,
      requestID: request.id
    }));
  }

  async listMessages(session: SessionSummary) {
    const entries = await dataOf(this.client.session.messages({
      sessionID: session.id,
      directory: session.directory,
      limit: 500
    }));
    for (const entry of entries) {
      for (const part of entry.parts) {
        this.#partTypes.remember(part);
      }
    }
    return entries
      .map(mapOpenCodeMessage)
      .filter((message): message is import("../../runtime/contracts.js").ChatMessage => Boolean(message))
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  async listSessionChangeLedger(session: SessionSummary) {
    return fetchSessionChangeLedger(this.client, session);
  }

  async revertSessionMessage(session: SessionSummary, messageId: string): Promise<void> {
    await dataOf(this.client.session.revert({
      sessionID: session.id,
      directory: session.directory,
      messageID: messageId
    }));
  }

  async createSession(directory: string): Promise<SessionSummary> {
    const session = await dataOf(this.client.session.create(createSessionParameters(directory)));
    return mapSession(session);
  }

  async renameSession(session: SessionSummary, title: string): Promise<SessionSummary> {
    const updated = await dataOf(this.client.session.update({
      sessionID: session.id,
      directory: session.directory,
      title
    }));
    return mapSession(updated);
  }

  async deleteSession(session: SessionSummary): Promise<void> {
    await dataOf(this.client.session.delete({
      sessionID: session.id,
      directory: session.directory
    }));
    this.#ownedSessionIds.delete(session.id);
  }

  async shareSession(session: SessionSummary): Promise<SessionSummary> {
    const updated = await dataOf(this.client.session.share({
      sessionID: session.id,
      directory: session.directory
    }));
    return mapSession(updated);
  }

  async unshareSession(session: SessionSummary): Promise<SessionSummary> {
    const updated = await dataOf(this.client.session.unshare({
      sessionID: session.id,
      directory: session.directory
    }));
    return mapSession(updated);
  }

  async sendMessage(session: SessionSummary, request: SendMessageRequest): Promise<void> {
    this.#ownedSessionIds.add(session.id);
    try {
      if (request.kind === "slash-command") {
        await dataOf(this.client.session.command({
          sessionID: session.id,
          directory: session.directory,
          command: request.command,
          arguments: request.arguments,
          ...(request.agent ? { agent: request.agent } : {}),
          ...(request.variant ? { variant: request.variant } : {}),
          ...(request.model
            ? { model: `${request.model.providerID}/${request.model.modelID}` }
            : {}),
          ...(request.contextParts?.length
            ? { parts: mapContextParts(request.contextParts) }
            : {})
        }));
        return;
      }
      if (request.kind === "shell") {
        const agent = request.agent ?? session.agent;
        if (!agent) {
          throw new Error("Shell 命令需要选择智能体。");
        }
        await dataOf(this.client.session.shell({
          sessionID: session.id,
          directory: session.directory,
          command: request.command,
          agent,
          ...(request.model
            ? { model: { providerID: request.model.providerID, modelID: request.model.modelID } }
            : {})
        }));
        return;
      }
      await dataOf(this.client.session.promptAsync({
        sessionID: session.id,
        directory: session.directory,
        ...(request.model
          ? { model: { providerID: request.model.providerID, modelID: request.model.modelID } }
          : {}),
        ...(request.variant ? { variant: request.variant } : {}),
        ...(request.agent ? { agent: request.agent } : {}),
        parts: [
          ...mapContextParts(request.contextParts ?? []),
          { type: "text", text: request.text }
        ]
      }));
    } catch (error) {
      this.#ownedSessionIds.delete(session.id);
      throw error;
    }
  }

  async queryComposerSuggestions(
    trigger: "slash" | "mention",
    query: string,
    directory: string | undefined,
    catalog: ModelCatalog
  ): Promise<ComposerSuggestionItem[]> {
    if (trigger === "slash") {
      const [commands, skills] = await Promise.all([
        fetchSlashCommands(this.client, directory),
        fetchSkills(this.client, directory)
      ]);
      const normalized = query.trim().toLowerCase();
      const commandItems = commands
        .filter((command) => !normalized || command.name.toLowerCase().includes(normalized))
        .filter((command) => !isExcludedSlashCommand(command.name))
        .map((command) => ({
          id: `slash:${command.name}`,
          kind: "slash-command" as const,
          label: command.name,
          detail: command.description,
          insertText: `/${command.name} `
        }));
      return mergeSkillSlashSuggestions(commandItems, skills)
        .filter((item) => !normalized || item.label.toLowerCase().includes(normalized));
    }
    return searchComposerMentions(this.client, query, directory, catalog);
  }

  async listCatalog(directory?: string): Promise<ModelCatalog> {
    return fetchModelCatalog(this.client, directory);
  }

  async getDefaultComposerSelection(directory?: string): Promise<Partial<ComposerSelection>> {
    return fetchDefaultComposerSelection(this.client, directory);
  }

  async persistDefaultComposerSelection(
    selection: ComposerSelection,
    directory?: string
  ): Promise<void> {
    await persistDefaultComposerSelection(this.client, selection, directory);
  }

  async applyComposerSelection(session: SessionSummary, selection: ComposerSelection): Promise<void> {
    try {
      const model = selection.providerID && selection.modelID
        ? { id: selection.modelID, providerID: selection.providerID, ...(selection.variant ? { variant: selection.variant } : {}) }
        : undefined;
      if (model) {
        await dataOf(this.client.v2.session.switchModel({ sessionID: session.id, model }));
      }
      if (selection.agent) {
        await dataOf(this.client.v2.session.switchAgent({ sessionID: session.id, agent: selection.agent }));
      }
    } catch {
      // 旧版 Server 可能不支持 v2 切换；发送消息时仍会附带选择参数。
    }
  }

  async abortSession(session: SessionSummary): Promise<void> {
    await dataOf(this.client.session.abort({
      sessionID: session.id,
      directory: session.directory
    }));
    this.#ownedSessionIds.delete(session.id);
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.#listeners.add(listener);
    this.#eventLoop ??= this.consumeEvents();
    return () => this.#listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    clearMessageRefreshThrottle(this.#messageRefreshStates);
    this.#partTypes.clear();
    const sessions = await this.listSessions().catch(() => []);
    await Promise.allSettled(
      sessions
        .filter((session) => this.#ownedSessionIds.has(session.id))
        .map((session) => this.abortSession(session))
    );
    this.#abortController.abort();
    await this.managedServer?.dispose();
    this.#listeners.clear();
  }

  async consumeEvents(): Promise<void> {
    try {
      const events = await this.client.global.event({ signal: this.#abortController.signal });
      for await (const event of events.stream) {
        this.routeEvent(event);
      }
      if (!this.#abortController.signal.aborted) {
        this.emit({ type: "connection-lost", message: "OpenCode 事件连接已结束。" });
      }
    } catch (error) {
      if (!this.#abortController.signal.aborted) {
        this.emit({
          type: "connection-lost",
          message: error instanceof Error ? error.message : "OpenCode 事件连接失败。"
        });
      }
    }
  }

  routeEvent(event: GlobalEvent): void {
    const payload = event.payload;
    if (payload.type === "session.created" || payload.type === "session.updated" || payload.type === "session.deleted") {
      this.emit({ type: "sessions-changed" });
      return;
    }
    if (payload.type === "catalog.updated" || payload.type === "models.dev.refreshed") {
      this.emit({ type: "catalog-changed" });
      return;
    }
    if (payload.type === "message.part.delta") {
      if (payload.properties.field === "text" && this.#partTypes.isTextPart(payload.properties.partID)) {
        this.emit({
          type: "message-text-delta",
          sessionId: payload.properties.sessionID,
          messageId: payload.properties.messageID,
          delta: payload.properties.delta
        });
      }
      return;
    }
    if (payload.type === "session.next.text.delta") {
      this.emit({
        type: "message-text-delta",
        sessionId: payload.properties.sessionID,
        messageId: payload.properties.assistantMessageID,
        delta: payload.properties.delta
      });
      return;
    }
    if (payload.type === "session.next.text.ended") {
      this.emit({
        type: "message-text-finalized",
        sessionId: payload.properties.sessionID,
        messageId: payload.properties.assistantMessageID,
        text: payload.properties.text
      });
      scheduleThrottledMessageRefresh(
        this.#messageRefreshStates,
        payload.properties.sessionID,
        () => this.emit({ type: "messages-changed", sessionId: payload.properties.sessionID })
      );
      return;
    }
    if (payload.type === "message.part.updated") {
      this.#partTypes.remember(payload.properties.part);
    }
    if (payload.type === "message.part.removed") {
      this.#partTypes.forget(payload.properties.partID);
    }
    if (payload.type === "message.updated" || payload.type === "message.removed" || payload.type === "message.part.updated" || payload.type === "message.part.removed") {
      const sessionId = payload.properties.sessionID;
      scheduleThrottledMessageRefresh(
        this.#messageRefreshStates,
        sessionId,
        () => this.emit({ type: "messages-changed", sessionId })
      );
      return;
    }
    if (payload.type === "session.status") {
      this.emit({
        type: "session-status",
        sessionId: payload.properties.sessionID,
        status: payload.properties.status.type
      });
      if (payload.properties.status.type === "idle") {
        this.#ownedSessionIds.delete(payload.properties.sessionID);
        scheduleThrottledMessageRefresh(
          this.#messageRefreshStates,
          payload.properties.sessionID,
          () => this.emit({ type: "messages-changed", sessionId: payload.properties.sessionID })
        );
      }
      return;
    }
    if (payload.type === "permission.v2.asked" || payload.type === "permission.asked") {
      this.emit({
        type: "permission-requested",
        sessionId: payload.properties.sessionID,
        request: payload.type === "permission.v2.asked"
          ? mapV2Permission(payload.properties)
          : mapLegacyPermission(payload.properties)
      });
      return;
    }
    if (payload.type === "permission.v2.replied" || payload.type === "permission.replied") {
      this.emit({
        type: "permission-resolved",
        sessionId: payload.properties.sessionID,
        requestId: payload.properties.requestID
      });
      return;
    }
    if (payload.type === "question.v2.asked" || payload.type === "question.asked") {
      this.emit({
        type: "question-requested",
        sessionId: payload.properties.sessionID,
        request: payload.type === "question.v2.asked"
          ? mapV2Question(payload.properties)
          : mapLegacyQuestion(payload.properties)
      });
      return;
    }
    if (payload.type === "question.v2.replied" || payload.type === "question.replied" || payload.type === "question.v2.rejected" || payload.type === "question.rejected") {
      this.emit({
        type: "question-resolved",
        sessionId: payload.properties.sessionID,
        requestId: payload.properties.requestID
      });
      return;
    }
    if (payload.type === "session.error" && payload.properties.sessionID) {
      this.#ownedSessionIds.delete(payload.properties.sessionID);
      this.emit({
        type: "session-failed",
        sessionId: payload.properties.sessionID,
        message: readOpenCodeErrorMessage(payload.properties.error) ?? "OpenCode 会话执行失败。"
      });
      return;
    }
    if (payload.type === "session.idle") {
      this.#ownedSessionIds.delete(payload.properties.sessionID);
      this.emit({ type: "session-status", sessionId: payload.properties.sessionID, status: "idle" });
      scheduleThrottledMessageRefresh(
        this.#messageRefreshStates,
        payload.properties.sessionID,
        () => this.emit({ type: "messages-changed", sessionId: payload.properties.sessionID })
      );
    }
  }

  emit(event: RuntimeEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

function mapV2Permission(request: {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  save?: string[];
  source?: { type: "tool"; messageID: string; callID: string };
}): PermissionRequest {
  return {
    id: request.id,
    sessionId: request.sessionID,
    action: request.action,
    resources: request.resources,
    canRemember: Boolean(request.save?.length),
    ...(request.source ? {
      source: { type: "tool" as const, messageId: request.source.messageID, callId: request.source.callID }
    } : {}),
    transport: "v2"
  };
}

function mapLegacyPermission(request: {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  always: string[];
  tool?: { messageID: string; callID: string };
}): PermissionRequest {
  return {
    id: request.id,
    sessionId: request.sessionID,
    action: request.permission,
    resources: request.patterns,
    canRemember: request.always.length > 0,
    ...(request.tool ? {
      source: { type: "tool" as const, messageId: request.tool.messageID, callId: request.tool.callID }
    } : {}),
    transport: "legacy"
  };
}

type SdkQuestion = {
  id: string;
  sessionID: string;
  questions: Array<{
    header: string;
    question: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
  tool?: { messageID: string; callID: string };
};

function mapV2Question(request: SdkQuestion): QuestionRequest {
  return mapQuestion(request, "v2");
}

function mapLegacyQuestion(request: SdkQuestion): QuestionRequest {
  return mapQuestion(request, "legacy");
}

function mapQuestion(request: SdkQuestion, transport: "v2" | "legacy"): QuestionRequest {
  return {
    id: request.id,
    sessionId: request.sessionID,
    questions: request.questions.map((question) => ({
      header: question.header,
      question: question.question,
      options: question.options.map((option) => ({ label: option.label, description: option.description })),
      ...(question.multiple ? { multiple: true } : {}),
      ...(question.custom ? { custom: true } : {})
    })),
    ...(request.tool ? { source: { messageId: request.tool.messageID, callId: request.tool.callID } } : {}),
    transport
  };
}

function mapMcpStatus(name: string, status: { status: string; error?: string }): McpServerStatus {
  return {
    name,
    status: status.status,
    ...(status.error ? { detail: status.error } : {})
  };
}
