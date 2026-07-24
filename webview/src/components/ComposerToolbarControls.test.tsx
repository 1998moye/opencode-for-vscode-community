// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { ToolbarPopoverProvider } from "../composer/useToolbarPopover";
import { ComposerToolbarControls } from "./ComposerToolbarControls";

const dispatch = vi.fn();

vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: ReturnType<typeof vi.fn> }) => unknown) => selector({ dispatch })
}));

vi.mock("../vscodeApi", () => ({ postToHost: vi.fn() }));

afterEach(() => {
  cleanup();
  dispatch.mockReset();
});

describe("ComposerToolbarControls", () => {
  it("展示智能体与模型药丸，并在切换智能体时派发选择更新", () => {
    render(
      <ToolbarPopoverProvider>
        <ComposerToolbarControls state={readyState()} />
      </ToolbarPopoverProvider>
    );

    expect(screen.getByRole("button", { name: "智能体" }).textContent).toContain("默认智能体");
    expect(screen.getByRole("button", { name: "模型" }).textContent).toContain("GPT-4");

    fireEvent.click(screen.getByRole("button", { name: "智能体" }));
    fireEvent.click(screen.getByRole("option", { name: /build/ }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "update-composer-selection",
      selection: { agent: "build" }
    });
  });

  it("模型弹层仅展示已连接供应商", () => {
    render(
      <ToolbarPopoverProvider>
        <ComposerToolbarControls state={{
          ...readyState(),
          catalog: {
            loaded: true,
            providers: [
              { id: "zen", name: "OpenCode Zen", connected: true },
              { id: "google", name: "Google", connected: false }
            ],
            models: [
              { id: "free", providerID: "zen", name: "GLM Free", variants: [], inputModalities: ["text"], available: true }
            ],
            agents: readyState().catalog.agents
          },
          composerSelection: { providerID: "zen", modelID: "free" }
        }} />
      </ToolbarPopoverProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(screen.getByText("OpenCode Zen")).toBeTruthy();
    expect(screen.queryByText(/Google/)).toBeNull();
  });
});

function readyState(): OpenCodeState {
  return {
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
    sessions: [],
    activeSessionId: undefined,
    messages: [],
    draft: "",
    busySessionIds: [],
    sessionStatuses: {},
    catalog: {
      loaded: true,
      providers: [{ id: "openai", name: "OpenAI", connected: true }],
      models: [{ id: "gpt-4", providerID: "openai", name: "GPT-4", variants: [], inputModalities: ["text"], available: true }],
      agents: [{ id: "build", name: "build", hidden: false, mode: "primary", description: "Default agent" }]
    },
    composerSelection: { providerID: "openai", modelID: "gpt-4" },
    composerPreference: {},
    contextItems: [],
    composerSuggestions: { requestId: "", trigger: "slash", query: "", status: "idle", items: [] },
    error: undefined
  };
}
