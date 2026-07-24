// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { ChangeReviewCenter } from "./ChangeReviewCenter";

vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: () => void }) => unknown) => selector({ dispatch: vi.fn() })
}));

function baseState(patch: Partial<OpenCodeState> = {}): OpenCodeState {
  return {
    phase: "ready",
    locale: "zh-cn",
    trusted: true,
    cli: { status: "compatible", executable: "opencode", version: "1" },
    connection: {
      status: "connected",
      ownership: "managed",
      serverVersion: "1",
      topology: "managed-local",
      capabilities: {
        chat: { enabled: true },
        history: { enabled: true },
        share: { enabled: true },
        fileContext: { enabled: true },
        problems: { enabled: true },
        gitDiff: { enabled: true },
        review: { enabled: true },
        revert: { enabled: true },
        pty: { enabled: true }
      }
    },
    sessions: [{ id: "s1", title: "t", directory: "/p", updatedAt: 1 }],
    activeSessionId: "s1",
    messages: [],
    draft: "",
    busySessionIds: [],
    sessionStatuses: {},
    permissions: [],
    questions: [],
    catalog: { loaded: true, providers: [], models: [], agents: [] },
    composerSelection: {},
    composerPreference: {},
    contextItems: [],
    composerSuggestions: {
      requestId: "",
      trigger: "slash",
      query: "",
      status: "idle",
      items: []
    },
    changeReview: { status: "ready", entries: [] },
    error: undefined,
    ...patch
  };
}

describe("ChangeReviewCenter", () => {
  it("无变更条目时不渲染", () => {
    const { container } = render(<ChangeReviewCenter state={baseState()} />);
    expect(container.firstChild).toBeNull();
  });

  it("有变更条目时默认折叠，展开后显示文件", () => {
    render(
      <ChangeReviewCenter
        state={baseState({
          changeReview: {
            status: "ready",
            entries: [{
              filePath: "/p/a.ts",
              status: "modified",
              additions: 1,
              deletions: 0,
              revertibility: "readonly"
            }]
          }
        })}
      />
    );
    expect(screen.getByText("1 个文件")).toBeTruthy();
    expect(screen.queryByText("a.ts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("全部保留")).toBeTruthy();
    expect(screen.getByText("保留")).toBeTruthy();
  });
});
