import { describe, expect, it } from "vitest";
import type { SendMessageRequest } from "../src/runtime/contracts.js";
import { createOpenCodeRuntime } from "../src/runtime/openCodeRuntime.js";

function requestText(request: SendMessageRequest): string {
  return request.kind === "prompt" ? request.text : request.raw;
}

describe("OpenCodeRuntime", () => {
  it("重新发送或编辑历史提示时只向当前会话追加消息", async () => {
    const parent = { id: "parent", title: "原会话", directory: "D:\\demo", updatedAt: 1 };
    const sent: Array<{ sessionId: string; text: string }> = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed", serverVersion: "1.17.18",
          listSessions: async () => [parent], listMessages: async () => [], createSession: async () => parent,
          sendMessage: async (session, request) => { sent.push({ sessionId: session.id, text: requestText(request) }); },
          abortSession: async () => undefined, subscribe: () => () => undefined, dispose: async () => undefined
        })
      }
    });
    let snapshot = { ids: [] as string[], active: undefined as string | undefined };
    runtime.subscribe((state) => { snapshot = { ids: state.sessions.map((session) => session.id), active: state.activeSessionId }; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: parent.id });
    await runtime.dispatch({ type: "send-message", text: "编辑后的问题" });

    expect(snapshot).toEqual({ ids: ["parent"], active: "parent" });
    expect(sent).toEqual([{ sessionId: "parent", text: "编辑后的问题" }]);
    await runtime.dispose();
  });

  it("删除当前会话后清除失效选中项、消息与运行状态", async () => {
    const session = { id: "delete-session", title: "待删除", directory: "D:\\demo", updatedAt: 1 };
    let deleted = false;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed", serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [{ id: "m", sessionId: session.id, role: "user", text: "内容", createdAt: 1 }],
          createSession: async () => session,
          deleteSession: async () => { deleted = true; },
          sendMessage: async () => undefined, abortSession: async () => undefined,
          subscribe: () => () => undefined, dispose: async () => undefined
        })
      }
    });
    let snapshot = { sessions: 0, activeSessionId: undefined as string | undefined, messages: 0 };
    runtime.subscribe((state) => {
      snapshot = { sessions: state.sessions.length, activeSessionId: state.activeSessionId, messages: state.messages.length };
    });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });

    await runtime.dispatch({ type: "delete-session", sessionId: session.id });

    expect({ deleted, ...snapshot }).toEqual({ deleted: true, sessions: 0, activeSessionId: undefined, messages: 0 });
    await runtime.dispose();
  });

  it("通过 OpenCode 重命名会话并同步所有界面状态", async () => {
    const session = { id: "rename-session", title: "旧标题", directory: "D:\\demo", updatedAt: 1 };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          renameSession: async (target, title) => ({ ...target, title, updatedAt: 2 }),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let title = "";
    runtime.subscribe((state) => { title = state.sessions[0]?.title ?? ""; });
    await runtime.dispatch({ type: "initialize" });

    await runtime.dispatch({ type: "rename-session", sessionId: session.id, title: "新标题" });

    expect(title).toBe("新标题");
    await runtime.dispose();
  });

  it("初始化时发现 Server 上已有忙碌会话会立即进入跟随模式", async () => {
    const session = { id: "external-busy", title: "CLI 任务", directory: "D:\\demo", updatedAt: 1 };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listSessionStatuses: async () => ({ [session.id]: "busy" as const }),
          listMessages: async () => [],
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let status: { status: string; detail?: string } | undefined;
    runtime.subscribe((state) => { status = state.sessionStatuses[session.id]; });

    await runtime.dispatch({ type: "initialize" });

    expect(status).toEqual({ status: "following", detail: "其他客户端正在运行。" });
    await runtime.dispose();
  });

  it("后台会话等待授权时更新导航状态并发出无内容通知", async () => {
    const session = { id: "permission-session", title: "后台任务", directory: "D:\\demo", updatedAt: 1 };
    let eventListener: ((event: import("../src/runtime/contracts.js").RuntimeEvent) => void) | undefined;
    const notices: Array<{ type: string; sessionId: string }> = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      notify: (notice) => { notices.push(notice); },
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: (listener) => { eventListener = listener; return () => undefined; },
          dispose: async () => undefined
        })
      }
    });
    let status: { status: string } | undefined;
    runtime.subscribe((state) => { status = state.sessionStatuses[session.id]; });
    await runtime.dispatch({ type: "initialize" });

    eventListener?.({ type: "permission-requested", sessionId: session.id });
    await Promise.resolve();

    expect(status).toEqual({ status: "waiting-permission", detail: "OpenCode 正在等待用户授权。" });
    expect(notices).toEqual([{ type: "permission-required", sessionId: session.id }]);
    await runtime.dispose();
  });

  it("synchronizes concurrent permission requests and submits each reply only once", async () => {
    const sessions = [
      { id: "permission-a", title: "A", directory: "D:\\demo", updatedAt: 2 },
      { id: "permission-b", title: "B", directory: "D:\\demo", updatedAt: 1 }
    ];
    const replies: Array<{ id: string; reply: string }> = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed", serverVersion: "1.17.18",
          listSessions: async () => sessions, listMessages: async () => [], createSession: async () => sessions[0]!,
          listPendingPermissions: async () => [
            { id: "request-a", sessionId: "permission-a", action: "bash", resources: ["npm test"], canRemember: true },
            { id: "request-b", sessionId: "permission-b", action: "edit", resources: ["src/app.ts"], canRemember: false }
          ],
          respondToPermission: async (request, reply) => { replies.push({ id: request.id, reply }); },
          sendMessage: async () => undefined, abortSession: async () => undefined,
          subscribe: () => () => undefined, dispose: async () => undefined
        })
      }
    });
    let snapshot: import("../src/runtime/contracts.js").OpenCodeState | undefined;
    runtime.subscribe((state) => { snapshot = state; });

    await runtime.dispatch({ type: "initialize" });
    expect(snapshot?.permissions?.map((request) => request.id)).toEqual(["request-a", "request-b"]);
    expect(snapshot?.sessionStatuses["permission-a"]?.status).toBe("waiting-permission");
    expect(snapshot?.sessionStatuses["permission-b"]?.status).toBe("waiting-permission");

    await Promise.all([
      runtime.dispatch({ type: "respond-permission", requestId: "request-a", reply: "always" }),
      runtime.dispatch({ type: "respond-permission", requestId: "request-a", reply: "always" })
    ]);

    expect(replies).toEqual([{ id: "request-a", reply: "always" }]);
    expect(snapshot?.permissions?.map((request) => request.id)).toEqual(["request-b"]);
    expect(snapshot?.sessionStatuses["permission-a"]?.status).toBe("following");
    await runtime.dispose();
  });

  it("delivers an interactive permission request without waiting for a slow message refresh", async () => {
    const session = { id: "fast-permission", title: "Fast permission", directory: "D:\\demo", updatedAt: 1 };
    let listener: ((event: import("../src/runtime/contracts.js").RuntimeEvent) => void) | undefined;
    let blockRefresh = false;
    let releaseRefresh: (() => void) | undefined;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed", serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => blockRefresh
            ? new Promise((resolve) => { releaseRefresh = () => resolve([]); })
            : [],
          createSession: async () => session,
          sendMessage: async () => undefined, abortSession: async () => undefined,
          subscribe: (next) => { listener = next; return () => undefined; }, dispose: async () => undefined
        })
      }
    });
    let snapshot: import("../src/runtime/contracts.js").OpenCodeState | undefined;
    runtime.subscribe((state) => { snapshot = state; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    blockRefresh = true;

    listener?.({ type: "messages-changed", sessionId: session.id });
    await Promise.resolve();
    listener?.({
      type: "permission-requested",
      sessionId: session.id,
      request: { id: "fast-request", sessionId: session.id, action: "read", resources: ["src/app.ts"], canRemember: false }
    });
    await Promise.resolve();

    const permissionIdsBeforeRefreshCompletes = snapshot?.permissions?.map((request) => request.id);
    releaseRefresh?.();
    await runtime.dispose();
    expect(permissionIdsBeforeRefreshCompletes).toEqual(["fast-request"]);
  });

  it("shows an OpenCode question as selectable answers and returns the confirmed choice", async () => {
    const session = { id: "question-session", title: "Review", directory: "D:\\demo", updatedAt: 1 };
    const answers: string[][][] = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed", serverVersion: "1.17.18",
          listSessions: async () => [session], listMessages: async () => [], createSession: async () => session,
          listPendingQuestions: async () => [{
            id: "review-question", sessionId: session.id,
            questions: [{
              header: "确认检查", question: "可以开始检查代码吗？", multiple: false,
              options: [
                { label: "同意，开始检查", description: "检查代码" },
                { label: "暂不检查", description: "先不检查" }
              ]
            }]
          }],
          respondToQuestion: async (_request, selected) => { answers.push(selected); },
          sendMessage: async () => undefined, abortSession: async () => undefined,
          subscribe: () => () => undefined, dispose: async () => undefined
        })
      }
    });
    let snapshot: import("../src/runtime/contracts.js").OpenCodeState | undefined;
    runtime.subscribe((state) => { snapshot = state; });

    await runtime.dispatch({ type: "initialize" });
    expect(snapshot?.questions?.[0]?.questions[0]?.options.map((option) => option.label)).toEqual(["同意，开始检查", "暂不检查"]);

    await runtime.dispatch({ type: "respond-question", requestId: "review-question", answers: [["同意，开始检查"]] });

    expect(answers).toEqual([[["同意，开始检查"]]]);
    expect(snapshot?.questions).toEqual([]);
    await runtime.dispose();
  });

  it("切换会话前中断当前窗口发起的运行任务，再允许目标会话发送", async () => {
    const sessions = [
      { id: "session-a", title: "任务 A", directory: "D:\\demo", updatedAt: 2 },
      { id: "session-b", title: "任务 B", directory: "D:\\demo", updatedAt: 1 }
    ];
    const sent: string[] = [];
    const aborted: string[] = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => sessions,
          listMessages: async () => [],
          createSession: async () => sessions[0]!,
          sendMessage: async (session) => { sent.push(session.id); },
          abortSession: async (session) => { aborted.push(session.id); },
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let statuses: Record<string, { status: string }> = {};
    runtime.subscribe((state) => { statuses = state.sessionStatuses; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: "session-a" });
    await runtime.dispatch({ type: "send-message", text: "修改文件 A" });
    await runtime.dispatch({ type: "select-session", sessionId: "session-b" });

    await runtime.dispatch({ type: "send-message", text: "修改文件 B" });

    expect(aborted).toEqual(["session-a"]);
    expect(sent).toEqual(["session-a", "session-b"]);
    expect(statuses["session-a"]).toEqual({ status: "interrupted" });
    await runtime.dispose();
  });

  it("连接后发布经过验证的拓扑与能力清单", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "external",
          topology: "external-remote",
          serverVersion: "1.17.18",
          capabilities: {
            chat: { enabled: true },
            history: { enabled: true },
            share: { enabled: true },
            fileContext: { enabled: false, reason: "没有路径映射" },
            problems: { enabled: false, reason: "没有路径映射" },
            gitDiff: { enabled: false, reason: "没有路径映射" },
            review: { enabled: false, reason: "没有路径映射" },
            revert: { enabled: false, reason: "没有路径映射" },
            pty: { enabled: false, reason: "没有路径映射" }
          },
          listSessions: async () => [],
          listMessages: async () => [],
          createSession: async () => { throw new Error("不应创建会话"); },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let latest: ReturnType<typeof snapshotConnection> | undefined;
    runtime.subscribe((state) => { latest = snapshotConnection(state); });

    await runtime.dispatch({ type: "initialize" });

    expect(latest).toEqual({
      topology: "external-remote",
      fileContext: { enabled: false, reason: "没有路径映射" }
    });
    await runtime.dispose();
  });

  it("检测到兼容 CLI 后连接服务并展示 OpenCode 会话", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      initialDirectory: "D:\\projects\\demo",
      backend: {
        inspectCli: async () => ({
          status: "compatible",
          executable: "opencode",
          version: "1.17.18"
        }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [
            {
              id: "session-1",
              title: "修复登录问题",
              directory: "D:\\projects\\demo",
              updatedAt: 200
            }
          ],
          listMessages: async () => [],
          createSession: async () => {
            throw new Error("本测试不会创建会话");
          },
          sendMessage: async () => {
            throw new Error("本测试不会发送消息");
          },
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    const observed: Array<ReturnType<typeof captureState>> = [];
    const disposeSubscription = runtime.subscribe((state) => {
      observed.push(captureState(state));
    });

    await runtime.dispatch({ type: "initialize" });

    expect(observed.at(-1)).toEqual({
      phase: "ready",
      cliStatus: "compatible",
      serverVersion: "1.17.18",
      sessionTitles: ["修复登录问题"]
    });

    disposeSubscription();
    await runtime.dispose();
  });

  it("选择历史会话时按会话目录加载 OpenCode 消息", async () => {
    const session = {
      id: "session-history",
      title: "继续历史任务",
      directory: "D:\\projects\\history",
      updatedAt: 300
    };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      initialDirectory: "D:\\projects\\demo",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async (selected) => selected.directory === session.directory
            ? [{
                id: "message-1",
                sessionId: session.id,
                role: "assistant",
                text: "历史消息",
                createdAt: 250
              }]
            : [],
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    const observed: Array<{ activeSessionId: string | undefined; texts: string[] }> = [];
    runtime.subscribe((state) => {
      observed.push({
        activeSessionId: state.activeSessionId,
        texts: state.messages.map((message) => message.text)
      });
    });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });

    expect(observed.at(-1)).toEqual({
      activeSessionId: "session-history",
      texts: ["历史消息"]
    });
    await runtime.dispose();
  });

  it("新建会话时使用用户确认的目录并立即选中", async () => {
    const created = {
      id: "session-new",
      title: "新会话",
      directory: "D:\\projects\\chosen",
      updatedAt: 400
    };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [],
          listMessages: async () => [],
          createSession: async (directory) => directory === created.directory
            ? created
            : Promise.reject(new Error("目录错误")),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let activeSessionId: string | undefined;
    runtime.subscribe((state) => {
      activeSessionId = state.activeSessionId;
    });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "create-session", directory: created.directory });

    expect(activeSessionId).toBe("session-new");
    await runtime.dispose();
  });

  it("没有选中会话时首次发送会自动创建会话并发送内容", async () => {
    const created = {
      id: "session-first-message",
      title: "New session",
      directory: "D:\\projects\\active",
      updatedAt: 410
    };
    let createdDirectory: string | undefined;
    let sent: { sessionId: string; text: string } | undefined;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      resolveNewSessionDirectory: async () => created.directory,
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [],
          listMessages: async () => [],
          createSession: async (directory) => {
            createdDirectory = directory;
            return created;
          },
          sendMessage: async (session, request) => {
            sent = { sessionId: session.id, text: requestText(request) };
          },
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "send-message", text: "请检查这个项目" });

    expect({ createdDirectory, sent }).toEqual({
      createdDirectory: "D:\\projects\\active",
      sent: { sessionId: "session-first-message", text: "请检查这个项目" }
    });
    await runtime.dispose();
  });

  it("首次发送无法解析工作目录时保留草稿并展示错误", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      resolveNewSessionDirectory: async () => {
        throw new Error("无法读取当前工作区");
      },
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [],
          listMessages: async () => [],
          createSession: async () => { throw new Error("不应创建会话"); },
          sendMessage: async () => { throw new Error("不应发送消息"); },
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let latest = { draft: "", error: undefined as string | undefined };
    runtime.subscribe((state) => { latest = { draft: state.draft, error: state.error }; });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "update-draft", draft: "不要丢失这条消息" });
    await expect(runtime.dispatch({ type: "send-message", text: "不要丢失这条消息" })).resolves.toBeUndefined();

    expect(latest).toEqual({ draft: "不要丢失这条消息", error: "无法读取当前工作区" });
    await runtime.dispose();
  });

  it("发送消息后立即呈现用户内容，并由 OpenCode 事件重建回复", async () => {
    const session = {
      id: "session-chat",
      title: "聊天",
      directory: "D:\\projects\\chat",
      updatedAt: 500
    };
    let eventListener: ((event: {
      type: "messages-changed";
      sessionId: string;
    }) => void) | undefined;
    let messages = [] as Array<{
      id: string;
      sessionId: string;
      role: "user" | "assistant";
      text: string;
      createdAt: number;
    }>;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => messages,
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: (listener) => {
            eventListener = listener;
            return () => undefined;
          },
          dispose: async () => undefined
        })
      }
    });
    let latest: { texts: string[]; busy: string[] } = { texts: [], busy: [] };
    runtime.subscribe((state) => {
      latest = {
        texts: state.messages.map((message) => message.text),
        busy: state.busySessionIds
      };
    });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    await runtime.dispatch({ type: "send-message", text: "你好" });

    expect(latest).toEqual({ texts: ["你好"], busy: [session.id] });

    messages = [
      { id: "user-1", sessionId: session.id, role: "user", text: "你好", createdAt: 510 },
      { id: "assistant-1", sessionId: session.id, role: "assistant", text: "你好，我可以帮你编码。", createdAt: 520 }
    ];
    eventListener?.({ type: "messages-changed", sessionId: session.id });
    await new Promise((resolve) => setImmediate(resolve));

    expect(latest.texts).toEqual(["你好", "你好，我可以帮你编码。"]);
    await runtime.dispose();
  });

  it("文本增量事件会逐步更新助手回复", async () => {
    const session = {
      id: "session-stream",
      title: "流式",
      directory: "D:\\projects\\stream",
      updatedAt: 700
    };
    let eventListener: ((event: import("../src/runtime/contracts.js").RuntimeEvent) => void) | undefined;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [
            { id: "user-1", sessionId: session.id, role: "user", text: "你好", createdAt: 1 }
          ],
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: (listener) => {
            eventListener = listener;
            return () => undefined;
          },
          dispose: async () => undefined
        })
      }
    });
    let latest = { texts: [] as string[] };
    runtime.subscribe((state) => {
      latest = { texts: state.messages.map((message) => message.text) };
    });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    eventListener?.({ type: "message-text-delta", sessionId: session.id, messageId: "assistant-1", delta: "你" });
    eventListener?.({ type: "message-text-delta", sessionId: session.id, messageId: "assistant-1", delta: "好" });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(latest.texts).toEqual(["你好", "你好"]);
    await runtime.dispose();
  });

  it("用户可以只中止当前运行中的会话", async () => {
    const session = {
      id: "session-running",
      title: "运行中",
      directory: "D:\\projects\\running",
      updatedAt: 600
    };
    let aborted = false;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async (selected) => {
            aborted = selected.id === session.id;
          },
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });

    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    await runtime.dispatch({ type: "send-message", text: "开始任务" });
    await runtime.dispatch({ type: "abort-session" });

    expect(aborted).toBe(true);
    await runtime.dispose();
  });

  it("输入草稿通过 Runtime 状态在两个聊天界面之间共享", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "missing", executable: "opencode", message: "未安装" }),
        connect: async () => {
          throw new Error("CLI 不可用时不会连接");
        }
      }
    });
    const surfaceA: string[] = [];
    const surfaceB: string[] = [];
    runtime.subscribe((state) => surfaceA.push(state.draft));
    runtime.subscribe((state) => surfaceB.push(state.draft));

    await runtime.dispatch({ type: "update-draft", draft: "请检查当前项目" });

    expect(surfaceA.at(-1)).toBe("请检查当前项目");
    expect(surfaceB.at(-1)).toBe("请检查当前项目");
    await runtime.dispose();
  });

  it("连接失败时进入可重试错误状态而不是泄漏未处理异常", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => {
          throw new Error("健康检查超时");
        }
      }
    });
    let latest: { phase: string; error: string | undefined } = { phase: "idle", error: undefined };
    runtime.subscribe((state) => {
      latest = { phase: state.phase, error: state.error };
    });

    await expect(runtime.dispatch({ type: "initialize" })).resolves.toBeUndefined();

    expect(latest).toEqual({ phase: "error", error: "健康检查超时" });
    await runtime.dispose();
  });

  it("连接后加载会话列表失败时退出连接阶段并释放连接", async () => {
    let disposed = false;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => { throw new Error("会话接口返回 500"); },
          listMessages: async () => [],
          createSession: async () => { throw new Error("不应创建会话"); },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => { disposed = true; }
        })
      }
    });
    let latest = { phase: "idle", error: undefined as string | undefined };
    runtime.subscribe((state) => { latest = { phase: state.phase, error: state.error }; });

    await expect(runtime.dispatch({ type: "initialize" })).resolves.toBeUndefined();

    expect(latest).toEqual({
      phase: "error",
      error: "加载 OpenCode 会话列表失败：会话接口返回 500"
    });
    expect(disposed).toBe(true);
    await runtime.dispose();
  });

  it("未信任工作区不检测 CLI 也不建立连接", async () => {
    let inspected = false;
    let connected = false;
    const runtime = createOpenCodeRuntime({
      trusted: false,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => {
          inspected = true;
          return { status: "compatible", executable: "opencode", version: "1.17.18" };
        },
        connect: async () => {
          connected = true;
          throw new Error("不应连接");
        }
      }
    });
    let phase = "idle";
    runtime.subscribe((state) => { phase = state.phase; });

    await runtime.dispatch({ type: "initialize" });

    expect({ phase, inspected, connected }).toEqual({ phase: "restricted", inspected: false, connected: false });
    await runtime.dispose();
  });

  it("OpenCode 生成会话标题后通过更新事件刷新列表", async () => {
    const created = {
      id: "session-auto-title",
      title: "New session",
      directory: "D:\\projects\\demo",
      updatedAt: 1
    };
    let serverSessions = [created];
    let eventListener: ((event: { type: "sessions-changed" }) => void) | undefined;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => serverSessions,
          listMessages: async () => [],
          createSession: async () => created,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: (listener) => {
            eventListener = listener;
            return () => undefined;
          },
          dispose: async () => undefined
        })
      }
    });
    let title = "";
    runtime.subscribe((state) => { title = state.sessions[0]?.title ?? ""; });

    await runtime.dispatch({ type: "initialize" });
    serverSessions = [{ ...created, title: "修复登录页面错误", updatedAt: 2 }];
    eventListener?.({ type: "sessions-changed" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(title).toBe("修复登录页面错误");
    await runtime.dispose();
  });

  it("syncSurface 会等待初始化完成并重新广播当前状态", async () => {
    let listSessionsCalls = 0;
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
            listSessions: async () => {
              listSessionsCalls += 1;
              return [{ id: "session-1", title: "打招呼", directory: "D:\\demo", updatedAt: 1 }];
            },
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
    const phases: string[] = [];
    runtime.subscribe((state) => phases.push(state.phase));

    const initPromise = runtime.dispatch({ type: "initialize" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(phases).toContain("connecting");

    const syncPromise = runtime.syncSurface();
    releaseConnect?.();
    await initPromise;
    await syncPromise;

    expect(phases.at(-1)).toBe("ready");
    expect(listSessionsCalls).toBe(1);
    await runtime.dispose();
  });

  it("连接挂起时重试会打断并重新发起连接", async () => {
    let connectAttempts = 0;
    let releaseFirstConnect: (() => void) | undefined;
    const firstConnectGate = new Promise<void>((resolve) => {
      releaseFirstConnect = resolve;
    });
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => {
          connectAttempts += 1;
          if (connectAttempts === 1) {
            await firstConnectGate;
          }
          return {
            ownership: "managed",
            serverVersion: "1.17.18",
            listSessions: async () => [{ id: "session-1", title: "打招呼", directory: "D:\\demo", updatedAt: 1 }],
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
    let latestPhase = "idle";
    runtime.subscribe((state) => { latestPhase = state.phase; });

    const firstInit = runtime.dispatch({ type: "initialize" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(latestPhase).toBe("connecting");

    const retryInit = runtime.dispatch({ type: "initialize" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(connectAttempts).toBe(2);

    releaseFirstConnect?.();
    await firstInit;
    await retryInit;

    expect(latestPhase).toBe("ready");
    expect(connectAttempts).toBe(2);
    await runtime.dispose();
  });

  it("syncSurface 会重新广播当前状态", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [{ id: "session-1", title: "打招呼", directory: "D:\\demo", updatedAt: 1 }],
          listMessages: async () => [],
          createSession: async () => { throw new Error("不应创建会话"); },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let deliveries = 0;
    runtime.subscribe((state) => {
      if (state.phase === "ready") {
        deliveries += 1;
      }
    });

    await runtime.dispatch({ type: "initialize" });
    const before = deliveries;
    await runtime.syncSurface();

    expect(deliveries).toBeGreaterThan(before);
    await runtime.dispose();
  });

  it("分享会话后同步服务端返回的分享链接", async () => {
    const session = { id: "share-session", title: "可分享", directory: "D:\\demo", updatedAt: 1 };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          capabilities: {
            chat: { enabled: true }, history: { enabled: true }, share: { enabled: true },
            fileContext: { enabled: true }, problems: { enabled: true }, gitDiff: { enabled: true },
            review: { enabled: true }, revert: { enabled: true }, pty: { enabled: true }
          },
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          shareSession: async () => ({
            ...session,
            shareUrl: "https://share.example.com/abc"
          }),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let shareUrl: string | undefined;
    runtime.subscribe((state) => { shareUrl = state.sessions[0]?.shareUrl; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "share-session", sessionId: session.id });

    expect(shareUrl).toBe("https://share.example.com/abc");
    await runtime.dispose();
  });

  it("取消分享后移除分享链接", async () => {
    const session = {
      id: "unshare-session",
      title: "已分享",
      directory: "D:\\demo",
      updatedAt: 1,
      shareUrl: "https://share.example.com/old"
    };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          capabilities: {
            chat: { enabled: true }, history: { enabled: true }, share: { enabled: true },
            fileContext: { enabled: true }, problems: { enabled: true }, gitDiff: { enabled: true },
            review: { enabled: true }, revert: { enabled: true }, pty: { enabled: true }
          },
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          unshareSession: async () => ({ ...session, shareUrl: undefined }),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let shareUrl: string | undefined = "pending";
    runtime.subscribe((state) => { shareUrl = state.sessions[0]?.shareUrl; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "unshare-session", sessionId: session.id });

    expect(shareUrl).toBeUndefined();
    await runtime.dispose();
  });

  it("分享能力禁用时拒绝分享请求", async () => {
    const session = { id: "no-share", title: "私有", directory: "D:\\demo", updatedAt: 1 };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          capabilities: {
            chat: { enabled: true }, history: { enabled: true },
            share: { enabled: false, reason: "OpenCode 配置已禁用会话分享。" },
            fileContext: { enabled: true }, problems: { enabled: true }, gitDiff: { enabled: true },
            review: { enabled: true }, revert: { enabled: true }, pty: { enabled: true }
          },
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          shareSession: async () => { throw new Error("不应调用分享接口"); },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let error: string | undefined;
    runtime.subscribe((state) => { error = state.error; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "share-session", sessionId: session.id });

    expect(error).toBe("OpenCode 配置已禁用会话分享。");
    await runtime.dispose();
  });

  it("分享接口失败时保留错误说明并脱敏分享地址", async () => {
    const session = { id: "share-fail", title: "失败", directory: "D:\\demo", updatedAt: 1 };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          capabilities: {
            chat: { enabled: true }, history: { enabled: true }, share: { enabled: true },
            fileContext: { enabled: true }, problems: { enabled: true }, gitDiff: { enabled: true },
            review: { enabled: true }, revert: { enabled: true }, pty: { enabled: true }
          },
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          shareSession: async () => { throw new Error("分享失败：https://secret.example/share"); },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let error: string | undefined;
    runtime.subscribe((state) => { error = state.error; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "share-session", sessionId: session.id });

    expect(error).toBe("分享失败：[已脱敏分享链接]");
    await runtime.dispose();
  });

  it("外部会话更新事件会刷新分享状态", async () => {
    const session = { id: "external-share", title: "外部分享", directory: "D:\\demo", updatedAt: 1 };
    let serverSessions = [session];
    let eventListener: ((event: { type: "sessions-changed" }) => void) | undefined;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => serverSessions,
          listMessages: async () => [],
          createSession: async () => session,
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: (listener) => {
            eventListener = listener;
            return () => undefined;
          },
          dispose: async () => undefined
        })
      }
    });
    let shareUrl: string | undefined;
    runtime.subscribe((state) => { shareUrl = state.sessions[0]?.shareUrl; });
    await runtime.dispatch({ type: "initialize" });

    serverSessions = [{ ...session, shareUrl: "https://share.example.com/external" }];
    eventListener?.({ type: "sessions-changed" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(shareUrl).toBe("https://share.example.com/external");
    await runtime.dispose();
  });

  it("发送消息时附带编写区选择的模型与智能体", async () => {
    const session = { id: "model-session", title: "模型", directory: "D:\\demo", updatedAt: 1 };
    const sent: Array<Record<string, unknown>> = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          listCatalog: async () => ({
            loaded: true,
            providers: [{ id: "openai", name: "OpenAI", connected: true }],
            models: [{ id: "gpt-4", providerID: "openai", name: "GPT-4", variants: [], inputModalities: ["text", "image"], available: true }],
            agents: [{ id: "build", name: "build", hidden: false, mode: "primary" }]
          }),
          applyComposerSelection: async () => undefined,
          sendMessage: async (_session, request) => { sent.push(request); },
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    await runtime.dispatch({
      type: "update-composer-selection",
      selection: { providerID: "openai", modelID: "gpt-4", agent: "build" }
    });
    await runtime.dispatch({ type: "send-message", text: "你好" });

    expect(sent[0]).toEqual({
      kind: "prompt",
      text: "你好",
      model: { providerID: "openai", modelID: "gpt-4" },
      agent: "build"
    });
    await runtime.dispose();
  });

  it("选择会话时同步服务端模型与智能体", async () => {
    const session = {
      id: "sync-session",
      title: "同步",
      directory: "D:\\demo",
      updatedAt: 1,
      model: { providerID: "anthropic", modelID: "claude-3", variant: "fast" },
      agent: "plan"
    };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          listCatalog: async () => ({
            loaded: true,
            providers: [{ id: "anthropic", name: "Anthropic", connected: true }],
            models: [{
              id: "claude-3",
              providerID: "anthropic",
              name: "Claude 3",
              variants: ["fast"],
              inputModalities: ["text"],
              available: true
            }],
            agents: [{ id: "plan", name: "plan", hidden: false, mode: "primary" }]
          }),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let selection: Record<string, string | undefined> = {};
    runtime.subscribe((state) => { selection = state.composerSelection; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });

    expect(selection).toEqual({
      providerID: "anthropic",
      modelID: "claude-3",
      variant: "fast",
      agent: "plan"
    });
    await runtime.dispose();
  });

  it("连接后从 opencode 配置同步默认模型", async () => {
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      initialDirectory: "D:\\demo",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [],
          listMessages: async () => [],
          createSession: async () => ({ id: "s", title: "t", directory: "D:\\demo", updatedAt: 1 }),
          listCatalog: async () => ({
            loaded: true,
            providers: [{ id: "opencode-go", name: "OpenCode Go", connected: true }],
            models: [{
              id: "deepseek-v4-pro",
              providerID: "opencode-go",
              name: "DeepSeek V4 Pro",
              variants: [],
              inputModalities: ["text"],
              available: true
            }],
            agents: [{ id: "build", name: "build", hidden: false, mode: "primary" }]
          }),
          getDefaultComposerSelection: async () => ({
            providerID: "opencode-go",
            modelID: "deepseek-v4-pro",
            agent: "build"
          }),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let selection: Record<string, string | undefined> = {};
    runtime.subscribe((state) => { selection = state.composerSelection; });
    await runtime.dispatch({ type: "initialize" });
    expect(selection).toEqual({
      providerID: "opencode-go",
      modelID: "deepseek-v4-pro",
      agent: "build"
    });
    await runtime.dispose();
  });

  it("配置未指定默认值时从全局最近模型会话恢复模型与智能体", async () => {
    const recent = {
      id: "recent-cli-session",
      title: "CLI 最近会话",
      directory: "D:\\cli-project",
      updatedAt: 20,
      model: { providerID: "opencode-go", modelID: "deepseek-v4-pro" },
      agent: "build"
    };
    const older = {
      id: "older-session",
      title: "旧会话",
      directory: "D:\\cli-project",
      updatedAt: 10,
      model: { providerID: "opencode", modelID: "deepseek-v4-flash-free" },
      agent: "plan"
    };
    const emptyNewer = {
      id: "empty-newer-session",
      title: "尚未发送的空会话",
      directory: "D:\\demo",
      updatedAt: 30,
      agent: "plan"
    };
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      initialDirectory: "D:\\demo",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [emptyNewer, older, recent],
          listMessages: async () => [],
          createSession: async () => recent,
          listCatalog: async () => ({
            loaded: true,
            providers: [
              { id: "opencode", name: "OpenCode Zen", connected: true },
              { id: "opencode-go", name: "OpenCode Go", connected: true }
            ],
            models: [
              { id: "deepseek-v4-flash-free", providerID: "opencode", name: "DeepSeek V4 Flash Free", variants: [], inputModalities: ["text"], available: true },
              { id: "deepseek-v4-pro", providerID: "opencode-go", name: "DeepSeek V4 Pro", variants: [], inputModalities: ["text"], available: true }
            ],
            agents: [
              { id: "build", name: "build", hidden: false, mode: "primary" },
              { id: "plan", name: "plan", hidden: false, mode: "primary" }
            ]
          }),
          getDefaultComposerSelection: async () => ({}),
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let selection: Record<string, string | undefined> = {};
    runtime.subscribe((state) => { selection = state.composerSelection; });

    await runtime.dispatch({ type: "initialize" });

    expect(selection).toEqual({
      providerID: "opencode-go",
      modelID: "deepseek-v4-pro",
      agent: "build"
    });
    await runtime.dispose();
  });

  it("新建会话时保留上次编写区模型选择", async () => {
    const existing = { id: "old-session", title: "旧会话", directory: "D:\\demo", updatedAt: 1 };
    const created = { id: "new-session", title: "新会话", directory: "D:\\demo", updatedAt: 2 };
    const applied: Array<Record<string, unknown>> = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [existing],
          listMessages: async () => [],
          createSession: async () => created,
          listCatalog: async () => ({
            loaded: true,
            providers: [{ id: "openai", name: "OpenAI", connected: true }],
            models: [{ id: "gpt-4", providerID: "openai", name: "GPT-4", variants: [], inputModalities: ["text"], available: true }],
            agents: [{ id: "build", name: "build", hidden: false, mode: "primary" }]
          }),
          applyComposerSelection: async (_session, selection) => { applied.push(selection); },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let selection: Record<string, string | undefined> = {};
    let preference: Record<string, string | undefined> = {};
    runtime.subscribe((state) => {
      selection = state.composerSelection;
      preference = state.composerPreference;
    });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({
      type: "update-composer-selection",
      selection: { providerID: "openai", modelID: "gpt-4", agent: "build" }
    });
    await runtime.dispatch({ type: "create-session", directory: "D:\\demo" });

    expect(selection).toEqual({
      providerID: "openai",
      modelID: "gpt-4",
      agent: "build"
    });
    expect(preference).toEqual({
      providerID: "openai",
      modelID: "gpt-4",
      agent: "build"
    });
    expect(applied[0]).toEqual({
      providerID: "openai",
      modelID: "gpt-4",
      agent: "build"
    });
    await runtime.dispose();
  });

  it("斜杠命令走 command 接口", async () => {
    const session = { id: "slash-session", title: "斜杠", directory: "D:\\demo", updatedAt: 1, agent: "build" };
    const sent: SendMessageRequest[] = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          sendMessage: async (_session, request) => { sent.push(request); },
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    await runtime.dispatch({ type: "send-message", text: "/compact keep" });

    expect(sent[0]).toMatchObject({
      kind: "slash-command",
      command: "compact",
      arguments: "keep",
      raw: "/compact keep"
    });
    await runtime.dispose();
  });

  it("Shell 命令走 shell 接口", async () => {
    const session = { id: "shell-session", title: "Shell", directory: "D:\\demo", updatedAt: 1, agent: "build" };
    const sent: SendMessageRequest[] = [];
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          sendMessage: async (_session, request) => { sent.push(request); },
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    await runtime.dispatch({
      type: "update-composer-selection",
      selection: { agent: "build" }
    });
    await runtime.dispatch({ type: "send-message", text: "! npm test" });

    expect(sent[0]).toMatchObject({
      kind: "shell",
      command: "npm test",
      raw: "! npm test",
      agent: "build"
    });
    await runtime.dispose();
  });

  it("查询补全会忽略过期响应", async () => {
    const session = { id: "assist-session", title: "补全", directory: "D:\\demo", updatedAt: 1 };
    let resolveSecond: ((items: import("../src/runtime/contracts.js").ComposerSuggestionItem[]) => void) | undefined;
    const runtime = createOpenCodeRuntime({
      trusted: true,
      locale: "zh-cn",
      backend: {
        inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
        connect: async () => ({
          ownership: "managed",
          serverVersion: "1.17.18",
          listSessions: async () => [session],
          listMessages: async () => [],
          createSession: async () => session,
          queryComposerSuggestions: async (_trigger, query) => {
            if (query === "slow") {
              return new Promise((resolve) => { resolveSecond = resolve; });
            }
            return [{ id: "slash:fast", kind: "slash-command", label: "fast", insertText: "/fast " }];
          },
          sendMessage: async () => undefined,
          abortSession: async () => undefined,
          subscribe: () => () => undefined,
          dispose: async () => undefined
        })
      }
    });
    let suggestions: import("../src/runtime/contracts.js").ComposerSuggestionsState | undefined;
    runtime.subscribe((state) => { suggestions = state.composerSuggestions; });
    await runtime.dispatch({ type: "initialize" });
    await runtime.dispatch({ type: "select-session", sessionId: session.id });
    void runtime.dispatch({ type: "query-composer-suggestions", requestId: "r1", trigger: "slash", query: "slow" });
    await runtime.dispatch({ type: "query-composer-suggestions", requestId: "r2", trigger: "slash", query: "fast" });
    resolveSecond?.([{ id: "slash:slow", kind: "slash-command", label: "slow", insertText: "/slow " }]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(suggestions?.requestId).toBe("r2");
    expect(suggestions?.items[0]?.label).toBe("fast");
    await runtime.dispose();
  });
});

function snapshotConnection(state: import("../src/runtime/contracts.js").OpenCodeState) {
  return {
    topology: state.connection.topology,
    fileContext: state.connection.capabilities.fileContext
  };
}

function captureState(state: {
  phase: string;
  cli: { status: string };
  connection: { serverVersion: string | undefined };
  sessions: Array<{ title: string }>;
}) {
  return {
    phase: state.phase,
    cliStatus: state.cli.status,
    serverVersion: state.connection.serverVersion,
    sessionTitles: state.sessions.map((session) => session.title)
  };
}
