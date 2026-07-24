import { describe, expect, it, vi } from "vitest";
import type { OpenCodeConnection } from "../src/runtime/contracts.js";
import { OpenCodeStateStore } from "../src/runtime/state/openCodeStateStore.js";
import { SessionModule } from "../src/runtime/sessions/sessionModule.js";

describe("SessionModule", () => {
  it("冷启动创建会话时保留首条乐观用户消息", async () => {
    const connection = {
      createSession: vi.fn().mockResolvedValue({
        id: "session-new",
        title: "新会话",
        directory: "D:\\project",
        updatedAt: 1
      })
    } as unknown as OpenCodeConnection;
    const state = new OpenCodeStateStore("zh-cn", true);
    state.update({
      messages: [{
        id: "local-1",
        sessionId: "pending",
        role: "user",
        text: "/grilling",
        slashCommand: "grilling",
        createdAt: 1
      }]
    });
    const module = new SessionModule(state, () => connection);

    await module.create("D:\\project");

    expect(state.current.activeSessionId).toBe("session-new");
    expect(state.current.messages).toEqual([{
      id: "local-1",
      sessionId: "pending",
      role: "user",
      text: "/grilling",
      slashCommand: "grilling",
      createdAt: 1
    }]);
  });

  it("已有会话时新建会话会清空消息列表", async () => {
    const connection = {
      createSession: vi.fn().mockResolvedValue({
        id: "session-new",
        title: "新会话",
        directory: "D:\\project",
        updatedAt: 1
      })
    } as unknown as OpenCodeConnection;
    const state = new OpenCodeStateStore("zh-cn", true);
    state.update({
      activeSessionId: "session-old",
      messages: [{ id: "user-1", sessionId: "session-old", role: "user", text: "旧消息", createdAt: 1 }]
    });
    const module = new SessionModule(state, () => connection);

    await module.create("D:\\project");

    expect(state.current.messages).toEqual([]);
  });
});
