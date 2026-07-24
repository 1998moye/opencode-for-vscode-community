import type { OpenCodeConnection, SessionSummary } from "../contracts.js";
import type { CatalogModule } from "../catalog/catalogModule.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";
import { sanitizeShareError } from "./sanitizeShareError.js";

export class SessionModule {
  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly connection: () => OpenCodeConnection | undefined,
    private readonly catalog?: CatalogModule
  ) {}

  async refresh(): Promise<void> {
    const connection = this.connection();
    if (!connection) {
      return;
    }
    const sessions = await connection.listSessions();
    const ids = new Set(sessions.map((session) => session.id));
    const activeRemoved = Boolean(this.state.current.activeSessionId && !ids.has(this.state.current.activeSessionId));
    this.state.update({
      sessions,
      ...(activeRemoved ? { activeSessionId: undefined, messages: [] } : {}),
      sessionStatuses: Object.fromEntries(
        Object.entries(this.state.current.sessionStatuses).filter(([sessionId]) => ids.has(sessionId))
      ),
      busySessionIds: this.state.current.busySessionIds.filter((sessionId) => ids.has(sessionId))
    });
  }

  async select(sessionId: string): Promise<void> {
    const connection = this.connection();
    const session = this.state.current.sessions.find((candidate) => candidate.id === sessionId);
    if (!connection || !session) {
      this.state.update({ error: "找不到指定会话" });
      return;
    }
    const messages = await connection.listMessages(session);
    await this.catalog?.adoptSession(session);
    this.state.update({ activeSessionId: session.id, messages, error: undefined });
  }

  async create(directory: string): Promise<void> {
    const connection = this.connection();
    if (!connection || !directory.trim()) {
      return;
    }
    const session = await connection.createSession(directory);
    const fromColdStart = !this.state.current.activeSessionId;
    const optimisticMessages = fromColdStart
      ? this.state.current.messages.filter((message) => message.id.startsWith("local-") && message.role === "user")
      : [];
    this.state.update({
      sessions: [session, ...this.state.current.sessions.filter((candidate) => candidate.id !== session.id)],
      activeSessionId: session.id,
      messages: optimisticMessages,
      sessionStatuses: { ...this.state.current.sessionStatuses, [session.id]: { status: "idle" } },
      error: undefined
    });
    void this.catalog?.adoptSession(session);
  }

  async rename(sessionId: string, titleValue: string): Promise<void> {
    const connection = this.connection();
    const session = this.state.current.sessions.find((candidate) => candidate.id === sessionId);
    const title = titleValue.trim();
    if (!connection?.renameSession || !session || !title) {
      this.state.update({ error: "当前 OpenCode Server 不支持重命名该会话。" });
      return;
    }
    try {
      const updated = await connection.renameSession(session, title);
      this.state.update({
        sessions: this.state.current.sessions.map((candidate) => candidate.id === sessionId ? updated : candidate),
        error: undefined
      });
    } catch (error) {
      this.state.update({ error: error instanceof Error ? error.message : "重命名会话失败。" });
    }
  }

  async share(sessionId: string): Promise<void> {
    const connection = this.connection();
    const session = this.state.current.sessions.find((candidate) => candidate.id === sessionId);
    if (!this.state.current.connection.capabilities.share.enabled) {
      this.state.update({
        error: this.state.current.connection.capabilities.share.reason ?? "当前 OpenCode Server 不支持分享会话。"
      });
      return;
    }
    if (!connection?.shareSession || !session) {
      this.state.update({ error: "当前 OpenCode Server 不支持分享该会话。" });
      return;
    }
    try {
      const updated = await connection.shareSession(session);
      this.applySessionUpdate(sessionId, updated);
    } catch (error) {
      this.state.update({ error: sanitizeShareError(error) });
    }
  }

  async unshare(sessionId: string): Promise<void> {
    const connection = this.connection();
    const session = this.state.current.sessions.find((candidate) => candidate.id === sessionId);
    if (!this.state.current.connection.capabilities.share.enabled) {
      this.state.update({
        error: this.state.current.connection.capabilities.share.reason ?? "当前 OpenCode Server 不支持分享会话。"
      });
      return;
    }
    if (!connection?.unshareSession || !session) {
      this.state.update({ error: "当前 OpenCode Server 不支持取消分享该会话。" });
      return;
    }
    try {
      const updated = await connection.unshareSession(session);
      this.applySessionUpdate(sessionId, updated);
    } catch (error) {
      this.state.update({ error: sanitizeShareError(error) });
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const connection = this.connection();
    const session = this.state.current.sessions.find((candidate) => candidate.id === sessionId);
    if (!connection?.deleteSession || !session) {
      this.state.update({ error: "当前 OpenCode Server 不支持删除该会话。" });
      return false;
    }
    try {
      await connection.deleteSession(session);
      const sessionStatuses = { ...this.state.current.sessionStatuses };
      delete sessionStatuses[sessionId];
      const deletingActive = this.state.current.activeSessionId === sessionId;
      this.state.update({
        sessions: this.state.current.sessions.filter((candidate) => candidate.id !== sessionId),
        sessionStatuses,
        busySessionIds: this.state.current.busySessionIds.filter((id) => id !== sessionId),
        ...(deletingActive ? { activeSessionId: undefined, messages: [] } : {}),
        error: undefined
      });
      return true;
    } catch (error) {
      this.state.update({ error: error instanceof Error ? error.message : "删除会话失败，已保留服务端状态。" });
      return false;
    }
  }

  private applySessionUpdate(sessionId: string, updated: SessionSummary): void {
    this.state.update({
      sessions: this.state.current.sessions.map((candidate) => candidate.id === sessionId ? updated : candidate),
      error: undefined
    });
  }

}
