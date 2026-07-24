// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoricalMessageActions } from "./HistoricalMessageActions";

afterEach(cleanup);

describe("历史消息追加操作", () => {
  it("编辑旧提示后以新文本追加到当前会话", () => {
    const onSend = vi.fn();
    render(<HistoricalMessageActions locale="zh-cn" originalText="原问题" onSend={onSend} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByRole("textbox", { name: "编辑后发送的内容" }), { target: { value: "新问题" } });
    fireEvent.click(screen.getByRole("button", { name: "发送到当前会话" }));

    expect(onSend).toHaveBeenCalledWith("新问题");
  });

  it("重新发送会把原提示追加到当前会话", () => {
    const onSend = vi.fn();
    render(<HistoricalMessageActions locale="zh-cn" originalText="原问题" onSend={onSend} />);

    fireEvent.click(screen.getByRole("button", { name: "重新发送" }));

    expect(onSend).toHaveBeenCalledWith("原问题");
  });
});
