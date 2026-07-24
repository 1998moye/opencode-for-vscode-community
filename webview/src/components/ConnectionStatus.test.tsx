// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { ConnectionStatus } from "./ConnectionStatus";

vi.mock("../vscodeApi", () => ({ postToHost: vi.fn() }));

afterEach(cleanup);

describe("连接状态提示", () => {
  it("宿主状态尚未到达时显示准备中而不是连接失败", () => {
    const state: OpenCodeState = {
      phase: "idle",
      locale: "zh-cn",
      trusted: true,
      cli: { status: "unknown" },
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
      sessions: [],
      activeSessionId: undefined,
      messages: [],
      draft: "",
      busySessionIds: [],
      sessionStatuses: {},
      catalog: { loaded: false, providers: [], models: [], agents: [] },
      composerSelection: {},
      composerPreference: {},
      contextItems: [],
      composerSuggestions: { requestId: "", trigger: "slash", query: "", status: "idle", items: [] },
      error: undefined
    };

    render(<ConnectionStatus state={state} />);

    expect(screen.getByText("正在准备连接…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("Server 已连接但会话尚未加载完成时显示加载中", () => {
    const state: OpenCodeState = {
      phase: "connecting",
      locale: "zh-cn",
      trusted: true,
      cli: { status: "compatible", executable: "opencode", version: "1.17.18" },
      connection: {
        status: "connected",
        ownership: "managed",
        serverVersion: "1.17.18",
        topology: "managed-local",
        capabilities: {
          chat: { enabled: true }, history: { enabled: true }, share: { enabled: true }, fileContext: { enabled: true },
          problems: { enabled: true }, gitDiff: { enabled: true }, review: { enabled: true },
          revert: { enabled: true }, pty: { enabled: true }
        }
      },
      sessions: [],
      activeSessionId: undefined,
      messages: [],
      draft: "",
      busySessionIds: [],
      sessionStatuses: {},
      catalog: { loaded: false, providers: [], models: [], agents: [] },
      composerSelection: {},
      composerPreference: {},
      contextItems: [],
      composerSuggestions: { requestId: "", trigger: "slash", query: "", status: "idle", items: [] },
      error: undefined
    };

    render(<ConnectionStatus state={state} />);

    expect(screen.getByText("正在加载会话 · OpenCode 1.17.18")).toBeTruthy();
  });
});
