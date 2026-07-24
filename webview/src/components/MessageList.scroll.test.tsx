// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

const chatStore = vi.hoisted(() => ({ dispatch: vi.fn(), state: undefined as unknown }));
vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: ReturnType<typeof vi.fn>; state: unknown }) => unknown) => selector(chatStore)
}));

describe("MessageList scroll affordances", () => {
  it("shows scroll-to-bottom button when the chat is scrolled away from the end", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const { container, getByRole } = render(
      <div className="app-shell__body" style={{ height: 200, overflow: "auto" }}>
        <MessageList
          locale="zh-cn"
          messages={[{ id: "history", sessionId: "s", role: "assistant", text: "历史回复", createdAt: 1 }]}
        />
      </div>
    );
    const body = container.querySelector(".app-shell__body") as HTMLElement;
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 200 });
    await act(async () => {
      body.scrollTop = 0;
      body.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(getByRole("button", { name: "回到底部" })).toBeTruthy();
    }, { timeout: 500 });
  });
});
