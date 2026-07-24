// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStatusBar } from "./SessionStatusBar";

afterEach(cleanup);

describe("会话运行状态", () => {
  it("未知外部客户端忙碌时显示保守跟随说明", () => {
    render(<SessionStatusBar locale="zh-cn" status={{ status: "following", detail: "其他客户端正在运行。" }} />);

    expect(screen.getByText("跟随中 · 其他客户端正在运行。")).toBeTruthy();
  });
});
