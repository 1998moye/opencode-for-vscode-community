import type { ChangeReviewDismissAnchor } from "../contracts.js";
import {
  anchorFromLedgerEntry,
  isEntryDismissedByAnchors,
  normalizeReviewPath,
  upsertDismissAnchorForPath
} from "./changeReviewDismiss.js";
import type { ChangeLedgerEntry, OpenCodeConnection, SessionSummary } from "../contracts.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";

export class ChangeReviewModule {
  private reviewSessionId?: string;

  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly connection: () => OpenCodeConnection | undefined
  ) {}

  /**
   * 用户已成功回退后，从当前会话审查列表移除该项（刷新前仍过滤）。
   */
  dismissEntry(filePath: string): void {
    const review = this.state.current.changeReview;
    if (!review) {
      return;
    }
    const key = normalizeReviewPath(filePath);
    const entry = review.entries.find((candidate) => normalizeReviewPath(candidate.filePath) === key);
    const anchors = [...(review.dismissedAnchors ?? [])];
    const nextAnchors = entry
      ? upsertDismissAnchorForPath(anchors, anchorFromLedgerEntry(entry))
      : anchors;
    this.state.update({
      changeReview: {
        ...review,
        entries: review.entries.filter((candidate) => normalizeReviewPath(candidate.filePath) !== key),
        dismissedAnchors: nextAnchors
      }
    });
  }

  /**
   * 用户确认保留全部变更：从审查列表移除所有项（不修改磁盘）。
   */
  dismissAllEntries(): void {
    const review = this.state.current.changeReview;
    if (!review || review.entries.length === 0) {
      return;
    }
    let anchors = [...(review.dismissedAnchors ?? [])];
    for (const entry of review.entries) {
      anchors = upsertDismissAnchorForPath(anchors, anchorFromLedgerEntry(entry));
    }
    this.state.update({
      changeReview: {
        ...review,
        entries: [],
        dismissedAnchors: anchors
      }
    });
  }

  /**
   * 从 OpenCode 重建当前会话的变更账本。
   */
  async refresh(sessionId?: string): Promise<void> {
    const targetId = sessionId ?? this.state.current.activeSessionId;
    if (!targetId || this.state.current.activeSessionId !== targetId) {
      return;
    }
    const switchingSession = this.reviewSessionId !== undefined && this.reviewSessionId !== targetId;
    this.reviewSessionId = targetId;
    const dismissedSnapshot = (): ChangeReviewDismissAnchor[] => {
      if (switchingSession) {
        return [];
      }
      return this.state.current.changeReview?.dismissedAnchors ?? [];
    };

    const connection = this.connection();
    const session = this.state.current.sessions.find((candidate) => candidate.id === targetId);
    if (!connection?.listSessionChangeLedger || !session) {
      this.state.update({ changeReview: { status: "idle", entries: [] } });
      return;
    }
    const priorDismissed = dismissedSnapshot();
    if (!connection.capabilities?.review.enabled) {
      this.state.update({
        changeReview: {
          status: "ready",
          entries: [],
          dismissedAnchors: priorDismissed,
          error: connection.capabilities?.review.reason,
          updatedAt: Date.now()
        }
      });
      return;
    }
    this.state.update({
      changeReview: {
        status: "loading",
        entries: this.state.current.changeReview?.entries ?? [],
        dismissedAnchors: priorDismissed
      }
    });
    try {
      const anchors = dismissedSnapshot();
      const fetched = await connection.listSessionChangeLedger(session);
      const entries = fetched.filter((entry) => !isEntryDismissedByAnchors(entry, anchors));
      this.state.update({
        changeReview: {
          status: "ready",
          entries,
          dismissedAnchors: anchors,
          updatedAt: Date.now()
        }
      });
    } catch (error) {
      this.state.update({
        changeReview: {
          status: "error",
          entries: [],
          dismissedAnchors: dismissedSnapshot(),
          error: error instanceof Error ? error.message : "加载变更账本失败。",
          updatedAt: Date.now()
        }
      });
    }
  }

  findEntry(filePath: string): ChangeLedgerEntry | undefined {
    const normalized = normalizeReviewPath(filePath);
    return this.state.current.changeReview?.entries.find(
      (entry) => normalizeReviewPath(entry.filePath) === normalized
    );
  }

  activeSession(): SessionSummary | undefined {
    const id = this.state.current.activeSessionId;
    return id ? this.state.current.sessions.find((session) => session.id === id) : undefined;
  }
}
