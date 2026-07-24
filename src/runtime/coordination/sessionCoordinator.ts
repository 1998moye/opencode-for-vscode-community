import type { RuntimeNotice, SessionRuntimeStatus, SessionSummary } from "../contracts.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";

export class SessionCoordinator {
  readonly #locallyDriven = new Set<string>();

  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly notify: (notice: RuntimeNotice) => void
  ) {}

  begin(session: SessionSummary): boolean {
    const current = this.state.current.sessionStatuses[session.id]?.status;
    if (current === "running" || current === "following" || current === "waiting-permission") {
      return false;
    }
    this.#locallyDriven.add(session.id);
    this.setStatus(session.id, { status: "running" }, true);
    return true;
  }

  isLocallyDriven(sessionId: string): boolean {
    return this.#locallyDriven.has(sessionId);
  }

  handleServerStatus(sessionId: string, status: "idle" | "busy" | "retry"): void {
    if (status === "idle") {
      const local = this.#locallyDriven.delete(sessionId);
      this.setStatus(sessionId, { status: local ? "completed" : "idle" });
      if (local) {
        this.notify({ type: "session-completed", sessionId });
      }
      return;
    }
    this.setStatus(sessionId, this.#locallyDriven.has(sessionId)
      ? { status: "running", ...(status === "retry" ? { detail: "OpenCode 正在重试。" } : {}) }
      : { status: "following", detail: "其他客户端正在运行。" });
  }

  markSendRejected(sessionId: string, detail?: string): void {
    this.fail(sessionId, detail ?? "Server 拒绝发送。请检查模型是否支持该附件，或移除附件后重试。");
  }

  interrupt(sessionId: string): void {
    this.#locallyDriven.delete(sessionId);
    this.setStatus(sessionId, { status: "interrupted" });
  }

  removeSession(sessionId: string): void {
    this.#locallyDriven.delete(sessionId);
  }

  fail(sessionId: string, detail: string): void {
    if (["completed", "failed", "interrupted"].includes(this.state.current.sessionStatuses[sessionId]?.status ?? "")) {
      return;
    }
    this.#locallyDriven.delete(sessionId);
    this.setStatus(sessionId, { status: "failed", detail });
    this.notify({ type: "session-failed", sessionId });
  }

  permissionRequested(sessionId: string): void {
    const current = this.state.current.sessionStatuses[sessionId]?.status;
    if (current === "waiting-permission" || ["completed", "failed", "interrupted"].includes(current ?? "")) {
      return;
    }
    this.setStatus(sessionId, { status: "waiting-permission", detail: "OpenCode 正在等待用户授权。" });
    this.notify({ type: "permission-required", sessionId });
  }

  permissionResolved(sessionId: string): void {
    this.setStatus(sessionId, this.#locallyDriven.has(sessionId)
      ? { status: "running" }
      : { status: "following", detail: "其他客户端正在运行。" });
  }

  connectionLost(): void {
    this.#locallyDriven.clear();
  }

  dispose(): void {
    this.#locallyDriven.clear();
  }

  private setStatus(sessionId: string, status: SessionRuntimeStatus, allowRestart = false): void {
    const current = this.state.current.sessionStatuses[sessionId];
    if (!allowRestart && current && ["completed", "failed", "interrupted"].includes(current.status)) {
      return;
    }
    const sessionStatuses = { ...this.state.current.sessionStatuses, [sessionId]: status };
    const busySessionIds = Object.entries(sessionStatuses)
      .filter(([, value]) => ["running", "following", "waiting-permission"].includes(value.status))
      .map(([id]) => id);
    this.state.update({ sessionStatuses, busySessionIds });
  }
}
