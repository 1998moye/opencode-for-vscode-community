import { describe, expect, it } from "vitest";
import type { RuntimeEvent, SessionSummary } from "../src/runtime/contracts.js";
import { createOpenCodeRuntime } from "../src/runtime/openCodeRuntime.js";

describe("多会话协调", () => {
  it("完成后的重复和延迟事件不会让终态倒退或重复通知", async () => {
    const session = { id: "terminal", title: "终态", directory: "D:\\demo", updatedAt: 1 };
    let emit: ((event: RuntimeEvent) => void) | undefined;
    const notices: string[] = [];
    const runtime = createRuntime([session], () => undefined, (listener) => { emit = listener; }, (notice) => notices.push(notice.type));
    let status = "idle";
    runtime.subscribe((state) => { status = state.sessionStatuses[session.id]?.status ?? "idle"; });
    await runtime.dispatch({ type: "initialize" });
    await selectAndSend(runtime, session.id);

    emit?.({ type: "session-status", sessionId: session.id, status: "idle" });
    emit?.({ type: "session-status", sessionId: session.id, status: "busy" });
    emit?.({ type: "session-failed", sessionId: session.id, message: "延迟失败" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(status).toBe("completed");
    expect(notices).toEqual(["session-completed"]);
    await runtime.dispose();
  });
  it("keeps the composer retryable when the server rejects a send", async () => {
    const session = { id: "rejected", title: "Rejected", directory: "D:\\demo", updatedAt: 1 };
    const runtime = createRuntime([session], () => { throw new Error("Model does not support image input"); });
    let snapshot = { status: "idle", error: undefined as string | undefined };
    runtime.subscribe((state) => {
      snapshot = {
        status: state.sessionStatuses[session.id]?.status ?? "idle",
        error: state.error
      };
    });
    await runtime.dispatch({ type: "initialize" });
    await selectAndSend(runtime, session.id);

    expect(snapshot).toEqual({ status: "failed", error: "Model does not support image input" });
    await runtime.dispose();
  });
});

function createRuntime(
  sessions: SessionSummary[],
  send: (session: SessionSummary) => void,
  captureEvents: (listener: (event: RuntimeEvent) => void) => void = () => undefined,
  notify: NonNullable<Parameters<typeof createOpenCodeRuntime>[0]["notify"]> = () => undefined
) {
  return createOpenCodeRuntime({
    trusted: true,
    locale: "zh-cn",
    notify,
    backend: {
      inspectCli: async () => ({ status: "compatible", executable: "opencode", version: "1.17.18" }),
      connect: async () => ({
        ownership: "managed", serverVersion: "1.17.18",
        listSessions: async () => sessions, listMessages: async () => [], createSession: async () => sessions[0]!,
        sendMessage: async (session) => { send(session); }, abortSession: async () => undefined,
        subscribe: (listener) => { captureEvents(listener); return () => undefined; }, dispose: async () => undefined
      })
    }
  });
}

async function selectAndSend(
  runtime: ReturnType<typeof createOpenCodeRuntime>,
  sessionId: string
): Promise<void> {
  await runtime.dispatch({ type: "select-session", sessionId });
  await runtime.dispatch({ type: "send-message", text: sessionId });
}
