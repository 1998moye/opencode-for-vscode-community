// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { ConnectionCapabilities } from "./ConnectionCapabilities";

afterEach(cleanup);

describe("连接能力说明", () => {
  it("远程路径未验证时说明聊天可用而文件功能受限", () => {
    const capabilities: OpenCodeState["connection"]["capabilities"] = {
      chat: { enabled: true }, history: { enabled: true }, share: { enabled: true },
      fileContext: { enabled: false, reason: "远程服务没有已验证路径映射。" },
      problems: { enabled: false, reason: "远程服务没有已验证路径映射。" },
      gitDiff: { enabled: false, reason: "远程服务没有已验证路径映射。" },
      review: { enabled: false, reason: "远程服务没有已验证路径映射。" },
      revert: { enabled: false, reason: "远程服务没有已验证路径映射。" },
      pty: { enabled: false, reason: "远程服务没有已验证路径映射。" }
    };

    render(<ConnectionCapabilities locale="zh-cn" capabilities={capabilities} />);

    expect(screen.getByText("受限连接：聊天和历史仍可使用")).toBeTruthy();
    expect(screen.getByText("远程服务没有已验证路径映射。")).toBeTruthy();
  });
});
