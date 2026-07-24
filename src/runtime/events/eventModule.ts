import type { PermissionRequest, QuestionRequest, RuntimeEvent } from "../contracts.js";
import { CatalogModule } from "../catalog/catalogModule.js";
import type { ChangeReviewModule } from "../changeReview/changeReviewModule.js";
import { MessageModule } from "../messages/messageModule.js";
import { SessionModule } from "../sessions/sessionModule.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";
import { SessionCoordinator } from "../coordination/sessionCoordinator.js";

export class EventModule {
  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly sessions: SessionModule,
    private readonly messages: MessageModule,
    private readonly catalog: CatalogModule,
    private readonly coordinator: SessionCoordinator,
    private readonly changeReview?: ChangeReviewModule
  ) {}

  replacePermissions(requests: PermissionRequest[]): void {
    const previous = this.state.current.permissions ?? [];
    const unique = Array.from(new Map(requests.map((request) => [request.id, {
      ...request,
      status: request.status ?? "pending" as const
    }])).values());
    this.state.update({ permissions: unique });
    const pendingSessionIds = new Set(unique.map((request) => request.sessionId));
    for (const request of unique) {
      this.coordinator.permissionRequested(request.sessionId);
    }
    for (const sessionId of new Set(previous.map((request) => request.sessionId))) {
      if (!pendingSessionIds.has(sessionId)) {
        this.coordinator.permissionResolved(sessionId);
      }
    }
  }

  replaceQuestions(requests: QuestionRequest[]): void {
    const unique = Array.from(new Map(requests.map((request) => [request.id, {
      ...request,
      status: request.status ?? "pending" as const
    }])).values());
    this.state.update({ questions: unique });
  }

  async handle(event: RuntimeEvent): Promise<void> {
    if (event.type === "messages-changed") {
      await this.messages.refresh(event.sessionId);
      if (event.sessionId === this.state.current.activeSessionId) {
        void this.changeReview?.refresh(event.sessionId);
      }
      return;
    }
    if (event.type === "message-text-delta") {
      this.messages.applyTextDelta(event.sessionId, event.messageId, event.delta);
      return;
    }
    if (event.type === "message-text-finalized") {
      this.messages.finalizeText(event.sessionId, event.messageId, event.text);
      return;
    }
    if (event.type === "sessions-changed") {
      await this.sessions.refresh();
      const active = this.state.current.sessions.find((session) => session.id === this.state.current.activeSessionId);
      if (active) {
        this.catalog.applySessionSelection(active);
      }
      return;
    }
    if (event.type === "catalog-changed") {
      const active = this.state.current.sessions.find((session) => session.id === this.state.current.activeSessionId);
      await this.catalog.refresh(active?.directory);
      return;
    }
    if (event.type === "session-status") {
      await this.coordinator.handleServerStatus(event.sessionId, event.status);
      return;
    }
    if (event.type === "permission-requested") {
      if (event.request) {
        const pending = this.state.current.permissions ?? [];
        if (!pending.some((request) => request.id === event.request!.id)) {
          this.state.update({ permissions: [...pending, { ...event.request, status: "pending" }] });
        }
      }
      this.coordinator.permissionRequested(event.sessionId);
      return;
    }
    if (event.type === "permission-resolved") {
      const pending = this.state.current.permissions ?? [];
      const remaining = pending.filter((request) => event.requestId
        ? request.id !== event.requestId
        : request.sessionId !== event.sessionId);
      if (remaining.length !== pending.length) {
        this.state.update({ permissions: remaining });
      }
      if (!remaining.some((request) => request.sessionId === event.sessionId)) {
        this.coordinator.permissionResolved(event.sessionId);
      }
      return;
    }
    if (event.type === "question-requested") {
      if (event.request) {
        const pending = this.state.current.questions ?? [];
        if (!pending.some((request) => request.id === event.request!.id)) {
          this.state.update({ questions: [...pending, { ...event.request, status: "pending" }] });
        }
      }
      return;
    }
    if (event.type === "question-resolved") {
      const pending = this.state.current.questions ?? [];
      const remaining = pending.filter((request) => event.requestId
        ? request.id !== event.requestId
        : request.sessionId !== event.sessionId);
      if (remaining.length !== pending.length) {
        this.state.update({ questions: remaining });
      }
      return;
    }
    if (event.type === "session-failed") {
      await this.coordinator.fail(event.sessionId, event.message);
      return;
    }
    await this.coordinator.connectionLost();
    this.state.update({ permissions: [], questions: [], phase: "error", error: event.message });
  }
}
