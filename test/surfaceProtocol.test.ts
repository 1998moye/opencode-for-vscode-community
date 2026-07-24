import { describe, expect, it } from "vitest";
import { isWebviewMessage } from "../src/surfaces/surfaceProtocol.js";

describe("Webview 安全协议", () => {
  it("只接受无需权限的页面就绪信号", () => {
    expect(isWebviewMessage({ type: "surface-ready" })).toBe(true);
  });

  it("允许打开设置页", () => {
    expect(isWebviewMessage({ type: "open-settings" })).toBe(true);
  });

  it("允许打开 OpenCode 模型配置相关页面", () => {
    expect(isWebviewMessage({ type: "open-opencode-config" })).toBe(true);
    expect(isWebviewMessage({ type: "connect-opencode-provider" })).toBe(true);
    expect(isWebviewMessage({ type: "open-opencode-model-docs" })).toBe(true);
  });

  it("删除只能请求宿主确认，不能从网页视图直接派发破坏性意图", () => {
    expect(isWebviewMessage({
      type: "intent",
      intent: { type: "delete-session", sessionId: "sensitive-session" }
    })).toBe(false);
    expect(isWebviewMessage({
      type: "request-delete-session",
      sessionId: "sensitive-session"
    })).toBe(true);
  });

  it("allows validated permission and question replies to reach the runtime", () => {
    expect(isWebviewMessage({
      type: "intent",
      intent: { type: "respond-permission", requestId: "permission-1", reply: "once" }
    })).toBe(true);
    expect(isWebviewMessage({
      type: "intent",
      intent: { type: "respond-question", requestId: "question-1", answers: [["Start review"]] }
    })).toBe(true);
    expect(isWebviewMessage({
      type: "intent",
      intent: { type: "reject-question", requestId: "question-1" }
    })).toBe(true);
  });

  it("allows only known OpenCode CLI command actions", () => {
    expect(isWebviewMessage({
      type: "intent",
      intent: { type: "run-cli-command", command: "debug" }
    })).toBe(true);
    expect(isWebviewMessage({
      type: "intent",
      intent: { type: "run-cli-command", command: "models" }
    })).toBe(false);
  });

  it("allows validated open-file requests", () => {
    expect(isWebviewMessage({ type: "request-open-file", filePath: "D:/demo/config.ts" })).toBe(true);
    expect(isWebviewMessage({ type: "request-open-file", filePath: "" })).toBe(false);
  });
});
