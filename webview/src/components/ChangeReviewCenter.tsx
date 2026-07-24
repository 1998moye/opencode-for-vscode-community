import { useState } from "react";
import type { ChangeLedgerEntry, Locale, OpenCodeState } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { useChatStore } from "../store";

/**
 * @param locale - 界面语言
 * @param count - 文件数量
 */
function formatFileCountLabel(locale: Locale, count: number): string {
  if (locale === "en") {
    return count === 1 ? "1 file" : `${count} files`;
  }
  return `${count} 个文件`;
}

/**
 * 会话内 Agent 文件变更审查条（可折叠，类似 Cursor 文件列表）。
 */
export function ChangeReviewCenter({ state }: { state: OpenCodeState }) {
  const dispatch = useChatStore((store) => store.dispatch);
  const [expanded, setExpanded] = useState(false);
  const review = state.changeReview;
  const reviewEnabled = state.connection.capabilities.review.enabled;
  if (!reviewEnabled || !state.activeSessionId) {
    return null;
  }
  if (!review || review.status === "idle") {
    return null;
  }
  /** 无文件变更时不占位，避免挤占输入区。 */
  if (review.entries.length === 0) {
    return null;
  }

  const title = t(state.locale, "changeReviewTitle");
  const countLabel = formatFileCountLabel(state.locale, review.entries.length);
  const listId = "change-review-file-list";
  const canRevertAny = review.entries.some(
    (entry) => entry.revertibility === "full" && state.connection.capabilities.revert.enabled
  );

  return (
    <section
      className={`change-review${expanded ? " change-review--expanded" : " change-review--collapsed"}`}
      aria-label={title}
    >
      <header className="change-review__header">
        <button
          type="button"
          className="change-review__toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
        >
          <svg
            className={`change-review__chevron${expanded ? " change-review__chevron--open" : ""}`}
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="change-review__toggle-text">
            <span className="change-review__summary">{countLabel}</span>
            <span className="change-review__summary-hint">{title}</span>
          </span>
        </button>
        <div className="change-review__header-actions">
        <button
          type="button"
          className="change-review__btn"
          onClick={() => dispatch({ type: "refresh-change-review" })}
          disabled={review.status === "loading"}
        >
          {review.status === "loading" ? t(state.locale, "changeReviewLoading") : t(state.locale, "changeReviewRefresh")}
        </button>
        <button
          type="button"
          className="change-review__btn"
          onClick={() => dispatch({ type: "dismiss-all-change-review-entries" })}
          title={t(state.locale, "changeReviewKeepAll")}
        >
          {t(state.locale, "changeReviewKeepAll")}
        </button>
        {canRevertAny ? (
          <button
            type="button"
            className="change-review__btn change-review__btn--danger"
            onClick={() => dispatch({ type: "revert-all-change-files" })}
            title={t(state.locale, "changeReviewRevertAll")}
          >
            {t(state.locale, "changeReviewRevertAll")}
          </button>
        ) : null}
        </div>
      </header>
      {expanded ? (
        <>
          {review.status === "error" ? (
            <p className="change-review__error" role="alert">{review.error ?? t(state.locale, "error")}</p>
          ) : null}
          <ul className="change-review__list" id={listId}>
            {review.entries.map((entry) => (
              <ChangeReviewRow
                key={entry.filePath}
                entry={entry}
                state={state}
                onDiff={() => dispatch({ type: "open-change-diff", filePath: entry.filePath })}
                onKeep={() => dispatch({ type: "dismiss-change-review-entry", filePath: entry.filePath })}
                onRevert={() => dispatch({ type: "revert-change-file", filePath: entry.filePath })}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function ChangeReviewRow({
  entry,
  state,
  onDiff,
  onKeep,
  onRevert
}: {
  entry: ChangeLedgerEntry;
  state: OpenCodeState;
  onDiff: () => void;
  onKeep: () => void;
  onRevert: () => void;
}) {
  const fileName = entry.filePath.replace(/\\/g, "/").split("/").pop() ?? entry.filePath;
  const stats = `+${entry.additions} −${entry.deletions}`;
  const canRevert = entry.revertibility === "full" && state.connection.capabilities.revert.enabled;
  const revertLabel =
    entry.status === "added"
      ? t(state.locale, "changeReviewUndoAdd")
      : entry.status === "deleted"
        ? t(state.locale, "changeReviewRestore")
        : t(state.locale, "changeReviewRevert");

  return (
    <li className="change-review__row">
      <div className="change-review__meta">
        <span className={`change-review__status change-review__status--${entry.status}`}>{entry.status}</span>
        <button type="button" className="change-review__file" onClick={onDiff} title={entry.filePath}>
          {fileName}
        </button>
        <span className="change-review__stats">{stats}</span>
      </div>
      <div className="change-review__actions">
        <button type="button" className="change-review__btn change-review__btn--row" onClick={onDiff}>
          {t(state.locale, "changeReviewDiff")}
        </button>
        <button type="button" className="change-review__btn change-review__btn--row" onClick={onKeep}>
          {t(state.locale, "changeReviewKeep")}
        </button>
        {canRevert ? (
          <button type="button" className="change-review__btn change-review__btn--row change-review__btn--danger" onClick={onRevert}>
            {revertLabel}
          </button>
        ) : (
          <span className="change-review__hint" title={entry.revertBlockedReason}>
            {t(state.locale, "changeReviewReadonly")}
          </span>
        )}
      </div>
    </li>
  );
}
