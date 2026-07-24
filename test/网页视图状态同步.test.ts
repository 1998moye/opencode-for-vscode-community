import { describe, expect, it } from "vitest";
import { createOpenCodeRuntime } from "../src/runtime/openCodeRuntime.js";
import type { OpenCodeRuntime, OpenCodeState } from "../src/runtime/contracts.js";
import { 网页视图状态同步 } from "../src/surfaces/网页视图状态同步.js";

describe("网页视图状态同步", () => {
  it("页面就绪前缓存状态，就绪后一次性投递最新值", () => {
    const runtime = 固定状态运行时(就绪状态());
    const delivered: OpenCodeState[] = [];
    const sync = new 网页视图状态同步(runtime, (message) => delivered.push(message.state));

    expect(delivered).toHaveLength(0);
    sync.页面已就绪();
    expect(delivered).toEqual([就绪状态()]);
    sync.dispose();
  });

  it("页面就绪后立即投递连接中的状态，不等待初始化结束", async () => {
    let releaseConnect: (() => void) | undefined;
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => {
          await connectGate;
          return {
            ownership: "managed",
            serverVersion: "1.17.18",
            listSessions: async () => [],
            listMessages: async () => [],
            createSession: async () => { throw new Error("不应创建会话"); },
            sendMessage: async () => undefined,
            abortSession: async () => undefined,
            subscribe: () => () => undefined,
            dispose: async () => undefined
          };
        }
      }
    });
    const initPromise = runtime.dispatch({ type: "initialize" });
    await new Promise((resolve) => setImmediate(resolve));

    const delivered: string[] = [];
    const sync = new 网页视图状态同步(runtime, (message) => delivered.push(message.state.phase));
    sync.页面已就绪();
    expect(delivered.at(-1)).toBe("connecting");

    releaseConnect?.();
    await initPromise;
    await runtime.syncSurface();
    sync.dispose();
    await runtime.dispose();
  });

  it("页面就绪后重发运行时的最新状态，避免首次投递丢失", () => {
    const runtime = 固定状态运行时(就绪状态());
    const delivered: OpenCodeState[] = [];
    const sync = new 网页视图状态同步(runtime, (message) => delivered.push(message.state));

    delivered.length = 0;
    sync.页面已就绪();

    expect(delivered).toEqual([就绪状态()]);
    sync.dispose();
  });
});

function 固定状态运行时(state: OpenCodeState): OpenCodeRuntime {
  return {
    dispatch: async () => undefined,
    subscribe: (listener) => {
      listener(state);
      return () => undefined;
    },
    syncSurface: async () => undefined,
    dispose: async () => undefined
  };
}

function 就绪状态(): OpenCodeState {
  const enabled = { enabled: true };
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
        chat: enabled, history: enabled, share: enabled, fileContext: enabled, problems: enabled,
        gitDiff: enabled, review: enabled, revert: enabled, pty: enabled
      }
    },
    sessions: [{ id: "running", title: "运行中的任务", directory: "D:\\demo", updatedAt: 1 }],
    activeSessionId: "running",
    messages: [{ id: "message", sessionId: "running", role: "user", text: "继续执行", createdAt: 1 }],
    draft: "",
    busySessionIds: ["running"],
    sessionStatuses: { running: { status: "running" } },
    catalog: { loaded: true, providers: [], models: [], agents: [] },
    composerSelection: {},
    composerPreference: {},
    contextItems: [],
    error: undefined
  };
}
