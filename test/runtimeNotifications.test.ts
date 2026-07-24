import { beforeEach, describe, expect, it, vi } from "vitest";

const { showInformationMessage, showWarningMessage, showErrorMessage } = vi.hoisted(() => ({
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn()
}));

vi.mock("vscode", () => ({
  window: {
    showInformationMessage,
    showWarningMessage,
    showErrorMessage
  }
}));

import { showRuntimeNotice } from "../src/extension/runtimeNotifications.js";

describe("运行时通知", () => {
  beforeEach(() => {
    showInformationMessage.mockReset();
    showWarningMessage.mockReset();
    showErrorMessage.mockReset();
  });

  it("does not show a permission notification for the session already open in the chat surface", () => {
    showRuntimeNotice({ type: "permission-required", sessionId: "active" }, { activeSessionId: "active" });
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it("shows a generic permission notification only for a background session", () => {
    showRuntimeNotice({ type: "permission-required", sessionId: "background" }, { activeSessionId: "active" });
    expect(showWarningMessage).toHaveBeenCalledTimes(1);
  });

  it("当前会话完成时不弹后台任务提示", () => {
    showRuntimeNotice({ type: "session-completed", sessionId: "active" }, { activeSessionId: "active" });
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it("其他会话完成时弹后台任务提示", () => {
    showRuntimeNotice({ type: "session-completed", sessionId: "background" }, { activeSessionId: "active" });
    expect(showInformationMessage).toHaveBeenCalledWith("OpenCode 后台任务已完成。");
  });
});
