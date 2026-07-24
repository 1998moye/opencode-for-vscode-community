export type Locale = "zh-cn" | "en";

export type ConnectionTopology = "managed-local" | "external-same-filesystem" | "external-remote";

export interface ConnectionCapability {
  enabled: boolean;
  reason?: string;
}

export interface ConnectionCapabilities {
  chat: ConnectionCapability;
  history: ConnectionCapability;
  share: ConnectionCapability;
  fileContext: ConnectionCapability;
  problems: ConnectionCapability;
  gitDiff: ConnectionCapability;
  review: ConnectionCapability;
  revert: ConnectionCapability;
  pty: ConnectionCapability;
}

export type CliHealth =
  | { status: "missing"; executable: string; message: string }
  | { status: "incompatible"; executable: string; version: string; minimumVersion: string; message: string }
  | { status: "compatible"; executable: string; version: string }
  | { status: "error"; executable: string; message: string };

export interface SessionSummary {
  id: string;
  title: string;
  directory: string;
  updatedAt: number;
  /** 服务端已创建分享链接时存在；仅用于界面展示与复制，不进入诊断日志。 */
  shareUrl?: string;
  model?: {
    providerID: string;
    modelID: string;
    variant?: string;
  };
  agent?: string;
}

/** 会话内单文件 Agent 变更账本项（由 Server diff + 工具分片重建）。 */
export interface ChangeLedgerEntry {
  filePath: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  messageId?: string;
  agentBefore?: string;
  agentAfter?: string;
  patch?: string;
  revertibility: "full" | "readonly";
  revertBlockedReason?: string;
}

export interface ChangeReviewState {
  status: "idle" | "loading" | "ready" | "error";
  entries: ChangeLedgerEntry[];
  /** 本会话内用户已保留的变更锚点（刷新后仍过滤同快照；新消息/新内容会重新出现）。 */
  dismissedAnchors?: ChangeReviewDismissAnchor[];
  /** @deprecated 使用 dismissedAnchors */
  dismissedPaths?: string[];
  error?: string;
  updatedAt?: number;
}

/** 用户点「保留」时记录的 Agent 变更快照，用于与会话账本 diff 对齐。 */
export interface ChangeReviewDismissAnchor {
  filePath: string;
  messageId?: string;
  agentAfter?: string;
  status: ChangeLedgerEntry["status"];
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  connected: boolean;
  integrationID?: string;
}

export type ModelInputModality = "text" | "audio" | "image" | "video" | "pdf";

export interface ModelCatalogModel {
  id: string;
  providerID: string;
  name: string;
  variants: string[];
  inputModalities: ModelInputModality[];
  /** 是否已解锁可用；未连接订阅或凭据时可能为 false。 */
  available: boolean;
}

export interface IntegrationOAuthPrompt {
  type: "text" | "select";
  key: string;
  message: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string; hint?: string }>;
  when?: { key: string; op: "eq" | "neq"; value: string };
}

export interface IntegrationConnectMethod {
  type: "oauth" | "key" | "env";
  id?: string;
  label: string;
  envNames?: string[];
  oauthPrompts?: IntegrationOAuthPrompt[];
}

export interface IntegrationConnectEntry {
  id: string;
  name: string;
  connected: boolean;
  methods: IntegrationConnectMethod[];
}

export interface OAuthConnectAttempt {
  attemptID: string;
  url: string;
  instructions: string;
  mode: "auto" | "code";
}

export type OAuthConnectStatus =
  | { status: "pending" }
  | { status: "complete" }
  | { status: "failed"; message: string }
  | { status: "expired" };

export interface IntegrationConnectPort {
  list(directory?: string): Promise<IntegrationConnectEntry[]>;
  connectKey(integrationID: string, key: string, label?: string, directory?: string): Promise<void>;
  startOAuth(
    integrationID: string,
    methodID: string,
    inputs: Record<string, string>,
    label?: string,
    directory?: string
  ): Promise<OAuthConnectAttempt>;
  getOAuthStatus(attemptID: string, directory?: string): Promise<OAuthConnectStatus>;
  completeOAuth(attemptID: string, code: string, directory?: string): Promise<void>;
  cancelOAuth(attemptID: string, directory?: string): Promise<void>;
}

export interface ModelCatalogAgent {
  id: string;
  name: string;
  description?: string;
  hidden: boolean;
  mode: "subagent" | "primary" | "all";
}

export interface ModelCatalog {
  loaded: boolean;
  providers: ModelCatalogProvider[];
  models: ModelCatalogModel[];
  agents: ModelCatalogAgent[];
  error?: string;
}

export interface ComposerSelection {
  providerID?: string;
  modelID?: string;
  variant?: string;
  agent?: string;
  notice?: string;
}

export interface SlashCommandSummary {
  name: string;
  description?: string;
}

export type ComposerSuggestionKind = "slash-command" | "cli-command" | "agent" | "file" | "symbol";

export type CliBuiltinCommand = "help" | "debug" | "mcps" | "skills";

export interface ComposerSuggestionItem {
  id: string;
  kind: ComposerSuggestionKind;
  label: string;
  detail?: string;
  insertText: string;
  contextItem?: ContextItem;
  cliCommand?: CliBuiltinCommand;
}

export type ComposerSuggestionsState =
  | { requestId: string; trigger: "slash" | "mention"; query: string; status: "idle"; items: [] }
  | { requestId: string; trigger: "slash" | "mention"; query: string; status: "loading"; items: [] }
  | { requestId: string; trigger: "slash" | "mention"; query: string; status: "ready"; items: ComposerSuggestionItem[] }
  | { requestId: string; trigger: "slash" | "mention"; query: string; status: "error"; items: []; error: string };

export interface SendMessageOptions {
  model?: {
    providerID: string;
    modelID: string;
  };
  variant?: string;
  agent?: string;
  contextParts?: ContextPartInput[];
}

export type SendMessageRequest =
  | (SendMessageOptions & { kind: "prompt"; text: string })
  | (SendMessageOptions & { kind: "slash-command"; command: string; arguments: string; raw: string })
  | (SendMessageOptions & { kind: "shell"; command: string; raw: string });

export type ContextItemKind =
  | "selection"
  | "file"
  | "files"
  | "folder"
  | "problems"
  | "git-diff"
  | "terminal"
  | "terminal-paste"
  | "image"
  | "pdf"
  | "attachment";

export type ContextItemSource =
  | { type: "editor-selection"; uri: string; startLine: number; startCharacter: number; endLine: number; endCharacter: number }
  | { type: "file"; uri: string }
  | { type: "files"; uris: string[] }
  | { type: "folder"; uri: string }
  | { type: "problems"; uri?: string }
  | { type: "git-diff"; uri?: string }
  | { type: "terminal"; captureId: string }
  | { type: "terminal-paste"; text: string }
  | { type: "attachment-file"; uri: string; mime: string }
  | { type: "attachment-temp"; tempId: string; mime: string; filename: string; sizeBytes: number };

export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  label: string;
  detail?: string;
  sizeLabel?: string;
  error?: string;
  status?: "loading" | "ready";
  previewUri?: string;
  auto?: boolean;
  source: ContextItemSource;
}

export type ContextPartInput =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; url: string; filename?: string };

export type SessionActivity =
  | "idle"
  | "running"
  | "following"
  | "waiting-permission"
  | "completed"
  | "failed"
  | "interrupted";

export interface SessionRuntimeStatus {
  status: SessionActivity;
  detail?: string;
}

export interface ChatMessageStep {
  type: "tool" | "reasoning" | "unknown";
  label: string;
  detail?: string;
  input?: string;
  output?: string;
  status: "pending" | "running" | "completed" | "error";
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  steps?: ChatMessageStep[];
  streaming?: boolean;
  error?: string;
  /** 斜杠命令 / 技能的简短说明（如 init 的 guided setup），不展示技能 prompt 正文。 */
  slashDetail?: string;
  /** 斜杠命令名（不含 `/`），用于 Server 未返回 text 分片时的气泡展示。 */
  slashCommand?: string;
  /** 斜杠命令后的用户附加文字（如 `/init 这个技能是干嘛的` 中的说明）。 */
  slashArguments?: string;
}

export type PermissionReply = "once" | "always" | "reject";

/** A pending approval owned by OpenCode. Resources are shown only inside the webview, never in OS notifications. */
export interface PermissionRequest {
  id: string;
  sessionId: string;
  /** OpenCode permission action, such as bash, edit, or read. */
  action: string;
  resources: string[];
  /** Whether the server explicitly offers a session/project remember option. */
  canRemember: boolean;
  source?: { type: "tool"; messageId: string; callId: string };
  /** Internal endpoint selection; it is never rendered in the webview. */
  transport?: "v2" | "legacy";
  status?: "pending" | "submitting";
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  header: string;
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

/** A user-choice request emitted by the OpenCode question tool. */
export interface QuestionRequest {
  id: string;
  sessionId: string;
  questions: QuestionInfo[];
  source?: { messageId: string; callId: string };
  transport?: "v2" | "legacy";
  status?: "pending" | "submitting";
}

export type RuntimeEvent =
  | { type: "sessions-changed" }
  | { type: "messages-changed"; sessionId: string }
  | { type: "message-text-delta"; sessionId: string; messageId: string; delta: string }
  | { type: "message-text-finalized"; sessionId: string; messageId: string; text: string }
  | { type: "session-status"; sessionId: string; status: "idle" | "busy" | "retry" }
  | { type: "permission-requested"; sessionId: string; request?: PermissionRequest }
  | { type: "permission-resolved"; sessionId: string; requestId?: string }
  | { type: "question-requested"; sessionId: string; request?: QuestionRequest }
  | { type: "question-resolved"; sessionId: string; requestId?: string }
  | { type: "session-failed"; sessionId: string; message: string }
  | { type: "connection-lost"; message: string }
  | { type: "catalog-changed" };

export type RuntimeNotice =
  | { type: "permission-required"; sessionId: string }
  | { type: "session-completed"; sessionId: string }
  | { type: "session-failed"; sessionId: string };

export interface OpenCodeConnection {
  readonly ownership: "managed" | "external";
  readonly topology?: ConnectionTopology;
  readonly capabilities?: ConnectionCapabilities;
  readonly serverVersion: string;
  listSessions(): Promise<SessionSummary[]>;
  listSessionStatuses?(): Promise<Record<string, "idle" | "busy" | "retry">>;
  listPendingPermissions?(): Promise<PermissionRequest[]>;
  respondToPermission?(request: PermissionRequest, reply: PermissionReply): Promise<void>;
  listPendingQuestions?(): Promise<QuestionRequest[]>;
  respondToQuestion?(request: QuestionRequest, answers: string[][]): Promise<void>;
  rejectQuestion?(request: QuestionRequest): Promise<void>;
  listMessages(session: SessionSummary): Promise<ChatMessage[]>;
  listSessionChangeLedger?(session: SessionSummary): Promise<ChangeLedgerEntry[]>;
  revertSessionMessage?(session: SessionSummary, messageId: string): Promise<void>;
  createSession(directory: string): Promise<SessionSummary>;
  renameSession?(session: SessionSummary, title: string): Promise<SessionSummary>;
  deleteSession?(session: SessionSummary): Promise<void>;
  shareSession?(session: SessionSummary): Promise<SessionSummary>;
  unshareSession?(session: SessionSummary): Promise<SessionSummary>;
  listCatalog?(directory?: string): Promise<ModelCatalog>;
  getDefaultComposerSelection?(directory?: string): Promise<Partial<ComposerSelection>>;
  persistDefaultComposerSelection?(selection: ComposerSelection, directory?: string): Promise<void>;
  applyComposerSelection?(session: SessionSummary, selection: ComposerSelection): Promise<void>;
  queryComposerSuggestions?(
    trigger: "slash" | "mention",
    query: string,
    directory: string | undefined,
    catalog: ModelCatalog
  ): Promise<ComposerSuggestionItem[]>;
  sendMessage(session: SessionSummary, request: SendMessageRequest): Promise<void>;
  abortSession(session: SessionSummary): Promise<void>;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
  integrations?: IntegrationConnectPort;
  mcp?: McpPort;
  skills?: SkillPort;
  dispose(): Promise<void>;
}

export interface McpServerStatus {
  name: string;
  status: string;
  detail?: string;
}

export interface McpPort {
  list(directory?: string): Promise<McpServerStatus[]>;
  connect(name: string, directory?: string): Promise<void>;
  disconnect(name: string, directory?: string): Promise<void>;
}

export interface SkillSummary {
  name: string;
  description?: string;
}

export interface SkillPort {
  list(directory?: string): Promise<SkillSummary[]>;
}

export interface OpenCodeBackend {
  inspectCli(): Promise<CliHealth>;
  connect(directory: string | undefined): Promise<OpenCodeConnection>;
}

export type RuntimePhase =
  | "idle"
  | "checking-cli"
  | "connecting"
  | "ready"
  | "restricted"
  | "error";

export interface OpenCodeState {
  phase: RuntimePhase;
  locale: Locale;
  trusted: boolean;
  cli: CliHealth | { status: "unknown" };
  connection: {
    status: "disconnected" | "connecting" | "connected";
    ownership: "managed" | "external" | undefined;
    serverVersion: string | undefined;
    topology: ConnectionTopology | undefined;
    capabilities: ConnectionCapabilities;
  };
  sessions: SessionSummary[];
  activeSessionId: string | undefined;
  messages: ChatMessage[];
  draft: string;
  busySessionIds: string[];
  sessionStatuses: Record<string, SessionRuntimeStatus>;
  permissions?: PermissionRequest[];
  questions?: QuestionRequest[];
  catalog: ModelCatalog;
  composerSelection: ComposerSelection;
  composerPreference: ComposerSelection;
  contextItems: ContextItem[];
  composerSuggestions: ComposerSuggestionsState;
  changeReview?: ChangeReviewState;
  attachmentNotice?: string;
  error: string | undefined;
}

export type OpenCodeIntent =
  | { type: "initialize" }
  | { type: "select-session"; sessionId: string }
  | { type: "create-session"; directory: string }
  | { type: "rename-session"; sessionId: string; title: string }
  | { type: "delete-session"; sessionId: string }
  | { type: "share-session"; sessionId: string }
  | { type: "unshare-session"; sessionId: string }
  | { type: "send-message"; text: string }
  | { type: "abort-session" }
  | { type: "respond-permission"; requestId: string; reply: PermissionReply }
  | { type: "respond-question"; requestId: string; answers: string[][] }
  | { type: "reject-question"; requestId: string }
  | { type: "update-draft"; draft: string }
  | { type: "update-composer-selection"; selection: Partial<ComposerSelection> }
  | { type: "add-context-item"; item: ContextItem }
  | { type: "remove-context-item"; itemId: string }
  | { type: "sync-auto-selection"; item: ContextItem | null }
  | { type: "query-composer-suggestions"; requestId: string; trigger: "slash" | "mention"; query: string }
  | { type: "run-cli-command"; command: CliBuiltinCommand }
  | { type: "dismiss-composer-suggestions" }
  | { type: "set-attachment-notice"; notice?: string }
  | { type: "dismiss-attachment-notice" }
  | { type: "refresh-change-review" }
  | { type: "dismiss-change-review-entry"; filePath: string }
  | { type: "dismiss-all-change-review-entries" }
  | { type: "open-change-diff"; filePath: string }
  | { type: "revert-change-file"; filePath: string }
  | { type: "revert-all-change-files" }
  | { type: "revert-assistant-message-changes"; messageIds: string[] };

export interface OpenCodeRuntime {
  dispatch(intent: OpenCodeIntent): Promise<void>;
  subscribe(listener: (state: OpenCodeState) => void): () => void;
  /** 页面就绪后重新同步状态，并在连接已建立但初始化中断时尝试恢复。 */
  syncSurface(): Promise<void>;
  /** 当前 OpenCode 连接上的供应商集成端口；未连接时为 undefined。 */
  getIntegrationPort(): IntegrationConnectPort | undefined;
  getMcpPort(): McpPort | undefined;
  getSkillPort(): SkillPort | undefined;
  /** 在 Server 支持时撤销指定助手消息（含文件快照）；成功返回 true。 */
  revertSessionMessage(messageId: string): Promise<boolean>;
  dispose(): Promise<void>;
}
