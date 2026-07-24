import type { OpenCodeIntent, OpenCodeState } from "../runtime/contracts.js";

export type HostToWebviewMessage = { type: "state"; state: OpenCodeState };

export type WebviewToHostMessage =
  | { type: "intent"; intent: OpenCodeIntent }
  | { type: "open-editor" }
  | { type: "open-settings" }
  | { type: "open-opencode-config" }
  | { type: "connect-opencode-provider" }
  | { type: "open-opencode-model-docs" }
  | { type: "new-session" }
  | { type: "request-delete-session"; sessionId: string }
  | { type: "request-share-session"; sessionId: string }
  | { type: "request-unshare-session"; sessionId: string }
  | { type: "request-copy-share-link"; sessionId: string }
  | { type: "request-add-context"; kind: "current-file" | "files" | "folder" | "problems" | "git-diff" | "terminal" | "terminal-paste" | "attachments" }
  | { type: "request-pick-attachments" }
  | { type: "request-add-attachment-binary"; mime: string; filename: string; dataBase64: string }
  | { type: "request-open-file"; filePath: string }
  | { type: "surface-ready" }
  | { type: "retry" };

export function isWebviewMessage(value: unknown): value is WebviewToHostMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (
    value.type === "open-editor"
    || value.type === "open-settings"
    || value.type === "open-opencode-config"
    || value.type === "connect-opencode-provider"
    || value.type === "open-opencode-model-docs"
    || value.type === "new-session"
    || value.type === "surface-ready"
    || value.type === "retry"
  ) {
    return true;
  }
  if (value.type === "request-delete-session" || value.type === "request-share-session"
    || value.type === "request-unshare-session" || value.type === "request-copy-share-link") {
    return typeof value.sessionId === "string";
  }
  if (value.type === "request-add-context") {
    return typeof value.kind === "string";
  }
  if (value.type === "request-pick-attachments") {
    return true;
  }
  if (value.type === "request-add-attachment-binary") {
    return typeof value.mime === "string"
      && typeof value.filename === "string"
      && typeof value.dataBase64 === "string";
  }
  if (value.type === "request-open-file") {
    return typeof value.filePath === "string" && value.filePath.length > 0;
  }
  return value.type === "intent" && isIntent(value.intent);
}

function isIntent(value: unknown): value is OpenCodeIntent {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  switch (value.type) {
    case "initialize":
    case "abort-session":
      return true;
    case "respond-permission":
      return typeof value.requestId === "string"
        && (value.reply === "once" || value.reply === "always" || value.reply === "reject");
    case "respond-question":
      return typeof value.requestId === "string"
        && Array.isArray(value.answers)
        && value.answers.every((answer) => Array.isArray(answer) && answer.every((label) => typeof label === "string"));
    case "reject-question":
      return typeof value.requestId === "string";
    case "select-session":
      return typeof value.sessionId === "string";
    case "create-session":
      return typeof value.directory === "string";
    case "rename-session":
      return typeof value.sessionId === "string" && typeof value.title === "string";
    case "share-session":
    case "unshare-session":
      return typeof value.sessionId === "string";
    case "send-message":
      return typeof value.text === "string";
    case "update-draft":
      return typeof value.draft === "string";
    case "update-composer-selection":
      return isRecord(value.selection);
    case "add-context-item":
      return isContextItem(value.item);
    case "remove-context-item":
      return typeof value.itemId === "string";
    case "sync-auto-selection":
      return value.item === null || isContextItem(value.item);
    case "query-composer-suggestions":
      return typeof value.requestId === "string"
        && (value.trigger === "slash" || value.trigger === "mention")
        && typeof value.query === "string";
    case "run-cli-command":
      return value.command === "help" || value.command === "debug" || value.command === "mcps" || value.command === "skills";
    case "dismiss-composer-suggestions":
      return true;
    case "set-attachment-notice":
      return value.notice === undefined || typeof value.notice === "string";
    case "dismiss-attachment-notice":
      return true;
    case "refresh-change-review":
    case "dismiss-all-change-review-entries":
    case "revert-all-change-files":
      return true;
    case "revert-assistant-message-changes":
      return Array.isArray(value.messageIds)
        && value.messageIds.length > 0
        && value.messageIds.every((id) => typeof id === "string" && id.length > 0);
    case "dismiss-change-review-entry":
    case "open-change-diff":
    case "revert-change-file":
      return typeof value.filePath === "string" && value.filePath.length > 0;
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isContextItem(value: unknown): value is import("../runtime/contracts.js").ContextItem {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.kind === "string"
    && typeof value.label === "string"
    && isRecord(value.source);
}
