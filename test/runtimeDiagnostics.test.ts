import { describe, expect, it } from "vitest";
import type { OpenCodeState } from "../src/runtime/contracts.js";
import { formatRuntimeDiagnostic } from "../src/extension/runtimeDiagnostics.js";

describe("运行状态诊断", () => {
  it("只输出连接阶段和错误，不输出会话、消息或草稿", () => {
    const state: OpenCodeState = {
      phase: "error",
      locale: "zh-cn",
      trusted: true,
      cli: { status: "compatible", executable: "opencode", version: "1.17.18" },
      connection: {
        status: "disconnected",
        ownership: undefined,
        serverVersion: undefined,
        topology: undefined,
        capabilities: {
          chat: { enabled: false }, history: { enabled: false }, share: { enabled: false }, fileContext: { enabled: false },
          problems: { enabled: false }, gitDiff: { enabled: false }, review: { enabled: false },
          revert: { enabled: false }, pty: { enabled: false }
        }
      },
      sessions: [{ id: "secret-session", title: "私密标题", directory: "D:\\私密项目", updatedAt: 1 }],
      activeSessionId: "secret-session",
      messages: [{ id: "m1", sessionId: "secret-session", role: "user", text: "私密消息", createdAt: 1 }],
      draft: "私密草稿",
      busySessionIds: [],
      sessionStatuses: {},
      catalog: { loaded: true, providers: [], models: [], agents: [] },
      composerSelection: {},
      composerPreference: {},
      contextItems: [],
      error: "加载 OpenCode 会话列表失败：请求失败"
    };

    const line = formatRuntimeDiagnostic(state);

    expect(line).toContain("阶段=error");
    expect(line).toContain("CLI版本=1.17.18");
    expect(line).toContain("错误=加载 OpenCode 会话列表失败：请求失败");
    expect(line).not.toMatch(/私密标题|私密项目|私密消息|私密草稿|secret-session/);
  });

  it("错误信息中的分享链接会被脱敏", () => {
    const state: OpenCodeState = {
      phase: "ready",
      locale: "zh-cn",
      trusted: true,
      cli: { status: "compatible", executable: "opencode", version: "1.17.18" },
      connection: {
        status: "connected",
        ownership: "managed",
        serverVersion: "1.17.18",
        topology: "managed-local",
        capabilities: {
          chat: { enabled: true }, history: { enabled: true }, share: { enabled: true },
          fileContext: { enabled: true }, problems: { enabled: true }, gitDiff: { enabled: true },
          review: { enabled: true }, revert: { enabled: true }, pty: { enabled: true }
        }
      },
      sessions: [{ id: "s1", title: "会话", directory: "D:\\demo", updatedAt: 1, shareUrl: "https://secret.example/share" }],
      activeSessionId: "s1",
      messages: [],
      draft: "",
      busySessionIds: [],
      sessionStatuses: {},
      catalog: { loaded: true, providers: [], models: [], agents: [] },
      composerSelection: {},
      composerPreference: {},
      contextItems: [],
      error: "分享失败：https://secret.example/share"
    };

    const line = formatRuntimeDiagnostic(state);

    expect(line).toContain("错误=分享失败：[已脱敏分享链接]");
    expect(line).not.toContain("https://secret.example/share");
  });
});
