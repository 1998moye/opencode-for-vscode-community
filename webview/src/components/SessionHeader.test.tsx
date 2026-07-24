// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { SessionHeader } from "./SessionHeader";

const dispatch = vi.fn();
const onPanelChange = vi.fn();

vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: ReturnType<typeof vi.fn> }) => unknown) => selector({ dispatch })
}));
vi.mock("../vscodeApi", () => ({ postToHost: vi.fn() }));

afterEach(() => {
  cleanup();
  dispatch.mockReset();
  onPanelChange.mockReset();
});

describe("会话管理导航", () => {
  it("聊天视图展示当前会话标题", () => {
    const state = readyState();
    render(<SessionHeader state={state} panel="chat" onPanelChange={onPanelChange} />);

    expect(screen.getByText("后端任务")).toBeTruthy();
  });

  it("点击历史按钮进入会话列表", () => {
    const state = readyState();
    render(<SessionHeader state={state} panel="chat" onPanelChange={onPanelChange} />);

    fireEvent.click(screen.getByRole("button", { name: "会话历史" }));

    expect(onPanelChange).toHaveBeenCalledWith("history");
  });

  it("历史视图可按标题或目录筛选会话", () => {
    const state = readyState();
    render(<SessionHeader state={state} panel="history" onPanelChange={onPanelChange} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "筛选会话" }), { target: { value: "后端" } });

    expect(screen.getByText("后端任务")).toBeTruthy();
    expect(screen.queryByText("前端任务")).toBeNull();
  });

  it("选择会话后返回聊天视图", () => {
    const state = readyState();
    render(<SessionHeader state={state} panel="history" onPanelChange={onPanelChange} />);

    fireEvent.click(screen.getByRole("button", { name: /后端任务/ }));

    expect(dispatch).toHaveBeenCalledWith({ type: "select-session", sessionId: "backend" });
    expect(onPanelChange).toHaveBeenCalledWith("chat");
  });

  it("分享能力可用且未分享时显示分享操作", () => {
    const state = readyState();
    render(<SessionHeader state={state} panel="chat" onPanelChange={onPanelChange} />);

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

    expect(screen.getByRole("menuitem", { name: "分享会话" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "复制分享链接" })).toBeNull();
  });

  it("已分享会话显示复制链接与取消分享", () => {
    const state = readyState({ shareUrl: "https://share.example.com/abc" });
    render(<SessionHeader state={state} panel="chat" onPanelChange={onPanelChange} />);

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

    expect(screen.getByRole("menuitem", { name: "复制分享链接" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "取消分享" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "分享会话" })).toBeNull();
  });

  it("分享能力禁用时隐藏分享相关操作", () => {
    const state = readyState({ shareEnabled: false });
    render(<SessionHeader state={state} panel="chat" onPanelChange={onPanelChange} />);

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

    expect(screen.queryByRole("menuitem", { name: "分享会话" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "复制分享链接" })).toBeNull();
  });
});

function readyState(options: { shareUrl?: string; shareEnabled?: boolean } = {}): OpenCodeState {
  const enabled = { enabled: true };
  const shareEnabled = options.shareEnabled ?? true;
  return {
    phase: "ready", locale: "zh-cn", trusted: true,
    cli: { status: "compatible", executable: "opencode", version: "1.17.18" },
    connection: {
      status: "connected", ownership: "managed", serverVersion: "1.17.18", topology: "managed-local",
      capabilities: {
        chat: enabled, history: enabled,
        share: shareEnabled ? enabled : { enabled: false, reason: "已禁用" },
        fileContext: enabled, problems: enabled,
        gitDiff: enabled, review: enabled, revert: enabled, pty: enabled
      }
    },
    sessions: [
      { id: "backend", title: "后端任务", directory: "D:\\backend", updatedAt: 2, ...(options.shareUrl ? { shareUrl: options.shareUrl } : {}) },
      { id: "frontend", title: "前端任务", directory: "D:\\frontend", updatedAt: 1 }
    ],
    activeSessionId: "backend", messages: [], draft: "", busySessionIds: [], sessionStatuses: {},
    catalog: { loaded: true, providers: [], models: [], agents: [] },
    composerSelection: {},
    composerPreference: {},
    contextItems: [],
    composerSuggestions: { requestId: "", trigger: "slash", query: "", status: "idle", items: [] },
    error: undefined
  };
}
