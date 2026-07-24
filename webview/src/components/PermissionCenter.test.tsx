// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { PermissionCenter } from "./PermissionCenter";

const dispatch = vi.fn();
vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: typeof dispatch }) => unknown) => selector({ dispatch })
}));

afterEach(cleanup);

describe("PermissionCenter", () => {
  it("shows only the first queued permission and forwards the selected reply", () => {
    dispatch.mockClear();
    render(<PermissionCenter state={stateWithPermissions()} />);

    expect(screen.getByText("Pending approvals (1/2)")).toBeTruthy();
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("npm test")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Allow once" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remember and allow" })).toBeTruthy();
    expect(screen.queryByText("src/App.tsx")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "respond-permission", requestId: "bash-request", reply: "once" });
  });

  it("方向键切换焦点，Enter 触发当前按钮", () => {
    dispatch.mockClear();
    render(<PermissionCenter state={stateWithPermissions()} />);
    const allow = screen.getAllByRole("button", { name: "Allow once" })[0]!;
    allow.focus();
    const card = allow.closest(".permission-card");
    expect(card).toBeTruthy();
    fireEvent.keyDown(card!, { key: "ArrowRight" });
    const remember = screen.getByRole("button", { name: "Remember and allow" });
    expect(document.activeElement).toBe(remember);
    fireEvent.click(remember);
    expect(dispatch).toHaveBeenCalledWith({ type: "respond-permission", requestId: "bash-request", reply: "always" });
  });

  it("焦点在输入框时仍可用方向键切换并用 Enter 确认", () => {
    dispatch.mockClear();
    render(
      <>
        <textarea data-testid="composer" />
        <PermissionCenter state={stateWithPermissions()} />
      </>
    );
    const composer = screen.getByTestId("composer");
    composer.focus();
    fireEvent.keyDown(composer, { key: "ArrowRight" });
    const remember = screen.getByRole("button", { name: "Remember and allow" });
    expect(remember.className).toContain("permission-card__button--selected");
    expect(remember.className).not.toContain("permission-card__button--allow");
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(dispatch).toHaveBeenCalledWith({ type: "respond-permission", requestId: "bash-request", reply: "always" });
  });
});

function stateWithPermissions(): OpenCodeState {
  return {
    phase: "ready",
    locale: "en",
    trusted: true,
    cli: { status: "compatible", executable: "opencode", version: "1.17.18" },
    connection: {
      status: "connected", ownership: "managed", serverVersion: "1.17.18", topology: "managed-local",
      capabilities: {
        chat: { enabled: true }, history: { enabled: true }, share: { enabled: true }, fileContext: { enabled: true },
        problems: { enabled: true }, gitDiff: { enabled: true }, review: { enabled: true }, revert: { enabled: true }, pty: { enabled: true }
      }
    },
    sessions: [
      { id: "bash-session", title: "Run checks", directory: "D:\\demo", updatedAt: 2 },
      { id: "edit-session", title: "Edit app", directory: "D:\\demo", updatedAt: 1 }
    ],
    activeSessionId: "bash-session",
    messages: [], draft: "", busySessionIds: ["bash-session", "edit-session"],
    sessionStatuses: {
      "bash-session": { status: "waiting-permission" },
      "edit-session": { status: "waiting-permission" }
    },
    permissions: [
      { id: "bash-request", sessionId: "bash-session", action: "bash", resources: ["npm test"], canRemember: true },
      { id: "edit-request", sessionId: "edit-session", action: "edit", resources: ["src/App.tsx"], canRemember: false }
    ],
    catalog: { loaded: false, providers: [], models: [], agents: [] },
    composerSelection: {}, composerPreference: {}, contextItems: [],
    composerSuggestions: { requestId: "", trigger: "slash", query: "", status: "idle", items: [] },
    error: undefined
  };
}
