// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeState, ModelCatalog } from "../../../src/runtime/contracts";
import { Composer } from "./Composer";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: typeof dispatch }) => unknown) => selector({ dispatch })
}));
vi.mock("../vscodeApi", () => ({ postToHost: vi.fn() }));

beforeEach(() => {
  dispatch.mockReset();
});

afterEach(cleanup);

describe("消息输入框的中文输入法行为", () => {
  it("组合输入期间不向宿主发送半成品，也不被旧宿主状态覆盖", () => {
    const { rerender } = render(<Composer state={readyState("")} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "n" } });
    rerender(<Composer state={readyState("")} />);

    expect(input.value).toBe("n");
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { data: "你好", target: { value: "你好" } });

    expect(dispatch).toHaveBeenLastCalledWith({ type: "update-draft", draft: "你好" });
  });

  it("确认输入法候选词的 Enter 不会发送消息", () => {
    render(<Composer state={readyState("ni")} />);
    const input = screen.getByRole("textbox");

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(dispatch).not.toHaveBeenCalledWith({ type: "send-message", text: "ni" });
  });

  it("快速输入时忽略迟到的旧草稿回显", () => {
    const { rerender } = render(<Composer state={readyState("")} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: "n" } });
    fireEvent.change(input, { target: { value: "ni" } });
    rerender(<Composer state={readyState("n")} />);

    expect(input.value).toBe("ni");

    rerender(<Composer state={readyState("ni")} />);
    expect(input.value).toBe("ni");
  });

  it("没有选中会话时输入框仍可直接发送首条消息", () => {
    const state: OpenCodeState = {
      ...readyState(""),
      sessions: [],
      activeSessionId: undefined
    };
    render(<Composer state={state} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    const send = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;

    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "直接开始对话" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    expect(dispatch).toHaveBeenCalledWith({ type: "send-message", text: "直接开始对话" });
  });

  it("输入区与工具栏上下分区，按钮不在输入框内", () => {
    const { container } = render(<Composer state={readyState("")} />);
    const box = container.querySelector(".composer__box");
    const inputArea = container.querySelector(".composer__input-area");
    const toolbar = container.querySelector(".composer__toolbar");
    const input = screen.getByRole("textbox");

    expect(box?.contains(inputArea)).toBe(true);
    expect(box?.contains(toolbar)).toBe(true);
    expect(inputArea?.contains(input)).toBe(true);
    expect(toolbar?.contains(input)).toBe(false);
    expect(container.querySelector(".composer__actions")).toBeNull();
  });

  it("连续长文本会增高输入框而不是撑宽容器", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        const value = (this as HTMLTextAreaElement).value;
        return value.length > 40 ? 96 : 40;
      }
    });

    render(<Composer state={readyState("a".repeat(80))} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;

    expect(Number.parseInt(input.style.height, 10)).toBeGreaterThan(40);
    expect(input.style.overflowY).toBe("hidden");
  });
  it("sends a regular file attachment without draft text", () => {
    const state: OpenCodeState = {
      ...readyState(""),
      contextItems: [{
        id: "attachment-file-example-ts",
        kind: "attachment",
        label: "example.ts",
        source: { type: "attachment-file", uri: "file:///D:/project/example.ts", mime: "text/plain" }
      }]
    };
    const { container } = render(<Composer state={state} />);
    const send = container.querySelector(".composer__button--send") as HTMLButtonElement;

    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    expect(dispatch).toHaveBeenCalledWith({ type: "send-message", text: "" });
  });

  it.each(["/", "@"])('shows immediate autocomplete feedback for "%s"', (trigger) => {
    render(<Composer state={readyState("")} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: trigger, selectionStart: trigger.length } });

    expect(screen.getByText("正在加载补全…")).toBeTruthy();
  });
});

it("补全项只写入输入框，不直接执行 CLI 命令", () => {
  const state: OpenCodeState = {
    ...readyState("/debug"),
    composerSuggestions: {
      requestId: "suggestion-1",
      trigger: "slash",
      query: "debug",
      status: "ready",
      items: [{
        id: "slash:debug",
        kind: "slash-command",
        label: "debug",
        detail: "View OpenCode debug information",
        insertText: "/debug ",
        cliCommand: "debug"
      }]
    }
  };
  render(<Composer state={state} />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.select(input, { target: { selectionStart: "/debug".length } });

  fireEvent.mouseDown(screen.getByRole("option", { name: /debug/i }));

  expect(dispatch).toHaveBeenCalledWith({ type: "update-draft", draft: "/debug " });
  expect(dispatch).not.toHaveBeenCalledWith({ type: "run-cli-command", command: "debug" });
});

function readyState(draft: string): OpenCodeState {
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
        chat: { enabled: true }, history: { enabled: true }, share: { enabled: true }, fileContext: { enabled: true },
        problems: { enabled: true }, gitDiff: { enabled: true }, review: { enabled: true },
        revert: { enabled: true }, pty: { enabled: true }
      }
    },
    sessions: [{ id: "session-1", title: "测试", directory: "D:\\project", updatedAt: 1 }],
    activeSessionId: "session-1",
    messages: [],
    draft,
    busySessionIds: [],
    sessionStatuses: {},
    catalog: emptyCatalog(),
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
    error: undefined
  };
}

function emptyCatalog(): ModelCatalog {
  return { loaded: true, providers: [], models: [], agents: [] };
}
