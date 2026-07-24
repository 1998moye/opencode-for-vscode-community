// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

const chatStore = vi.hoisted(() => ({ dispatch: vi.fn(), state: undefined as unknown }));
vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: ReturnType<typeof vi.fn>; state: unknown }) => unknown) => selector(chatStore)
}));

describe("消息列表", () => {
  it("自动滚动不可用时仍能显示历史会话", () => {
    render(
      <MessageList
        locale="zh-cn"
        messages={[{ id: "history-message", sessionId: "history", role: "assistant", text: "历史回复", createdAt: 1 }]}
      />
    );

    expect(screen.getByText("历史回复")).toBeTruthy();
  });

  it("流式回复只在左侧时间线圆点显示动态效果", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[{ id: "streaming", sessionId: "history", role: "assistant", text: "正在输出", createdAt: 1, streaming: true }]}
      />
    );

    expect(container.querySelector(".message--streaming")).toBeTruthy();
    expect(container.querySelector(".message__streaming")).toBeNull();
  });
  it("scrolls again when a streaming message grows without adding a message", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const message = { id: "streaming", sessionId: "history", role: "assistant" as const, text: "正在", createdAt: 1, streaming: true };
    const { rerender } = render(<MessageList locale="zh-cn" messages={[message]} />);
    scrollIntoView.mockClear();

    rerender(<MessageList locale="zh-cn" messages={[{ ...message, text: "正在持续输出更多内容" }]} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
  it("scrolls to a newly rendered permission card even when no message changes", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    chatStore.state = undefined;
    const messages = [{ id: "assistant", sessionId: "s", role: "assistant" as const, text: "Waiting", createdAt: 1 }];
    const { rerender } = render(<MessageList locale="en" messages={messages} />);
    scrollIntoView.mockClear();
    chatStore.state = {
      locale: "en",
      sessions: [],
      permissions: [{ id: "permission", sessionId: "s", action: "read", resources: ["src/app.ts"], canRemember: false }],
      questions: []
    };

    rerender(<MessageList locale="en" messages={messages} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    chatStore.state = undefined;
  });

  it("出现授权时即使用户已上滑也会滚到底部", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    chatStore.state = undefined;
    const messages = [{ id: "assistant", sessionId: "s", role: "assistant" as const, text: "Waiting", createdAt: 1 }];
    const { container, rerender } = render(
      <div className="app-shell__body" style={{ height: 200, overflow: "auto" }}>
        <MessageList locale="zh-cn" messages={messages} />
      </div>
    );
    const body = container.querySelector(".app-shell__body") as HTMLElement;
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 200 });
    body.scrollTop = 0;
    scrollIntoView.mockClear();
    scrollTo.mockClear();
    chatStore.state = {
      locale: "zh-cn",
      sessions: [],
      permissions: [{ id: "permission", sessionId: "s", action: "bash", resources: ["bun run"], canRemember: true }],
      questions: []
    };
    await act(async () => {
      rerender(
        <div className="app-shell__body" style={{ height: 200, overflow: "auto" }}>
          <MessageList locale="zh-cn" messages={messages} />
        </div>
      );
    });
    expect(scrollIntoView.mock.calls.length + scrollTo.mock.calls.length).toBeGreaterThan(0);
    chatStore.state = undefined;
  });
  it("does not render empty assistant records as timeline dots", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[
          { id: "empty-1", sessionId: "history", role: "assistant", text: "", createdAt: 1, streaming: true },
          { id: "empty-2", sessionId: "history", role: "assistant", text: "", createdAt: 2, streaming: true },
          { id: "reply", sessionId: "history", role: "assistant", text: "实际回复", createdAt: 3 }
        ]}
      />
    );
    expect(container.querySelectorAll(".message--assistant")).toHaveLength(1);
  });

  it("groups tool steps with the following assistant reply into one timeline", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[
          { id: "tool-1", sessionId: "history", role: "assistant", text: "", createdAt: 1, steps: [{ type: "tool", label: "Read", status: "pending" as const }] },
          { id: "tool-2", sessionId: "history", role: "assistant", text: "", createdAt: 2, steps: [{ type: "tool", label: "Search", status: "completed" as const }] },
          { id: "reply", sessionId: "history", role: "assistant", text: "分析完成", createdAt: 3 }
        ]}
      />
    );
    expect(container.querySelectorAll(".message--assistant")).toHaveLength(1);
    expect(container.querySelectorAll(".message__timeline-step")).toHaveLength(2);
    expect(screen.getByText("等待授权")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("分析完成")).toBeTruthy();
  });

  it("uses one connected timeline for reasoning, tools, and the final output", () => {
    const { container } = render(
      <MessageList
        locale="en"
        messages={[{
          id: "timeline", sessionId: "history", role: "assistant", text: "Final answer", createdAt: 1, streaming: true,
          steps: [
            { type: "reasoning", label: "Thinking", status: "completed" },
            { type: "tool", label: "bash", status: "running" }
          ]
        }]}
      />
    );

    expect(container.querySelectorAll(".message__timeline-step")).toHaveLength(2);
    expect(container.querySelector(".message__timeline-output")).toBeTruthy();
    expect(container.querySelector(".message--has-timeline")).toBeTruthy();
    expect(container.querySelector(".message--has-timeline > .message__text")).toBeNull();
    expect(container.querySelector(".message__timeline-step--running .message__timeline-dot")).toBeTruthy();
  });

  it("keeps reasoning content collapsed by default", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[{
          id: "reasoning", sessionId: "history", role: "assistant", text: "结论", createdAt: 1,
          steps: [{ type: "reasoning", label: "Thinking", detail: "隐藏的思考内容", status: "completed" }]
        }]}
      />
    );
    const details = container.querySelector(".message__timeline-step--reasoning") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).not.toContain("隐藏的思考内容");
  });

  it("renders persisted Read calls as a compact file card", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[{
          id: "attachment", sessionId: "history", role: "user", createdAt: 1,
          text: `Called the Read tool with the following input:\n{"filePath":"d:\\projects\\demo\\d2_练习.ts"}\n你好，看下这个代码有没有问题`
        }]}
      />
    );

    expect(container.querySelector(".message__file-attachment")).toBeTruthy();
    expect(screen.getByText("TS")).toBeTruthy();
    expect(screen.getByText("d2_练习.ts")).toBeTruthy();
    expect(container.querySelector(".message__timeline")).toBeNull();
    expect(screen.getByText("你好，看下这个代码有没有问题")).toBeTruthy();
    expect(screen.queryByText(/Called the Read tool/)).toBeNull();
  });

  it("斜杠命令的用户气泡只渲染命令胶囊，不铺出整段命令文本", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[{ id: "cmd", sessionId: "history", role: "user", createdAt: 1, text: "/build 请把这些函数拆成小文件" }]}
      />
    );
    expect(container.querySelector(".message__command-chip")).toBeTruthy();
    expect(screen.getByText("build")).toBeTruthy();
    // 命令胶囊里只出现一次斜杠，整段裸命令文本不应作为独立文字块出现
    expect(container.querySelector(".message__text")?.textContent ?? "").not.toContain("/build 请把这些函数拆成小文件");
  });

  it("连续 assistant 段在中途出现正文文字时仍共用同一条时间线", () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[
          { id: "tool-1", sessionId: "history", role: "assistant", text: "", createdAt: 1, steps: [{ type: "tool", label: "Glob", status: "completed" as const }] },
          { id: "mid", sessionId: "history", role: "assistant", text: "我来检查一下结果", createdAt: 2 },
          { id: "reply", sessionId: "history", role: "assistant", text: "最终结论", createdAt: 3, steps: [{ type: "tool", label: "Read", status: "completed" as const }] }
        ]}
      />
    );
    // 三段 assistant 合并为一个气泡、一条时间线，不再拆成两条断开的时间线。
    expect(container.querySelectorAll(".message--assistant")).toHaveLength(1);
    expect(container.querySelectorAll(".message__timeline")).toHaveLength(1);
    expect(container.querySelectorAll(".message__timeline-step")).toHaveLength(2);
    // 中途正文（"我来检查一下结果"）出现在同一时间线内，不再被独立的 article 截断。
    expect(container.querySelectorAll(".message__timeline-output")).toHaveLength(2);
    expect(screen.getByText("我来检查一下结果")).toBeTruthy();
    expect(screen.getByText("最终结论")).toBeTruthy();
  });

  it("renders assistant markdown output with code blocks", async () => {
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[{
          id: "md-reply",
          sessionId: "history",
          role: "assistant",
          text: "运行方式：\n\n```bash\ncd projects/01-api-tool\n```",
          createdAt: 1,
          steps: [{ type: "tool", label: "write", status: "completed" as const }]
        }]}
      />
    );
    await waitFor(() => {
      expect(container.querySelector(".message__markdown .message__code-block")).toBeTruthy();
    });
    expect(container.textContent).not.toContain("```");
  });

  it("expands read tool output without duplicating the file path from input", async () => {
    const filePath = "D:/demo/config.ts";
    const { container } = render(
      <MessageList
        locale="zh-cn"
        messages={[{
          id: "read-tool",
          sessionId: "history",
          role: "assistant",
          text: "",
          createdAt: 1,
          steps: [{
            type: "tool",
            label: "read",
            status: "completed",
            input: filePath,
            output: `${filePath}\n\nexport const API_KEY = "x";\n`
          }]
        }]}
      />
    );
    const summary = container.querySelector(".message__timeline-step summary");
    expect(summary).toBeTruthy();
    await act(async () => {
      summary!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => {
      expect(container.querySelectorAll("button.message__payload-path")).toHaveLength(1);
    });
    expect(container.querySelector("button.message__payload-path")?.textContent).toContain("config.ts");
  });
});
