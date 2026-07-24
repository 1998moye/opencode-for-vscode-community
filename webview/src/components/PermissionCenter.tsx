import { useRef } from "react";
import type { OpenCodeState, PermissionReply, PermissionRequest } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { useChatStore } from "../store";
import { selectQueuedPermission } from "./interactionQueue";
import { useConfirmationArrowNavigation } from "./useConfirmationArrowNavigation";

export function PermissionCenter({ state }: { state: OpenCodeState }) {
  const dispatch = useChatStore((store) => store.dispatch);
  const permissions = state.permissions ?? [];
  const queued = selectQueuedPermission(permissions, state.activeSessionId);
  if (!queued) {
    return null;
  }

  const title = queued.total > 1
    ? `${t(state.locale, "permissionCenter")} (${queued.index}/${queued.total})`
    : t(state.locale, "permissionCenter");

  return (
    <section className="permission-center" aria-label={title}>
      <h2 className="permission-center__title">{title}</h2>
      {queued.total > 1 ? (
        <p className="permission-center__queue-hint">{t(state.locale, "permissionQueueHint")}</p>
      ) : null}
      <div className="permission-center__list">
        <PermissionCard
          key={queued.request.id}
          request={queued.request}
          state={state}
          onReply={(reply) => dispatch({ type: "respond-permission", requestId: queued.request.id, reply })}
        />
      </div>
    </section>
  );
}

function PermissionCard({
  request,
  state,
  onReply
}: {
  request: PermissionRequest;
  state: OpenCodeState;
  onReply: (reply: PermissionReply) => void;
}) {
  const submitting = request.status === "submitting";
  const session = state.sessions.find((candidate) => candidate.id === request.sessionId);
  const sessionLabel = session?.title || request.sessionId;
  const cardRef = useRef<HTMLElement>(null);
  const { selectedIndex } = useConfirmationArrowNavigation(cardRef, !submitting, {
    interceptFromOutside: true
  });
  const selectedClass = (index: number): string =>
    selectedIndex === index ? " permission-card__button--selected" : "";

  return (
    <article ref={cardRef} className="permission-card" aria-busy={submitting}>
      <div className="permission-card__heading">
        <span className="permission-card__icon" aria-hidden="true">?</span>
        <div>
          <strong>{t(state.locale, "permissionRequest")}</strong>
          <span className="permission-card__session">{t(state.locale, "permissionSession")}: {sessionLabel}</span>
        </div>
      </div>
      <dl className="permission-card__details">
        <div>
          <dt>{t(state.locale, "permissionTool")}</dt>
          <dd>{request.action}</dd>
        </div>
        <div>
          <dt>{t(state.locale, "permissionTarget")}</dt>
          <dd title={request.resources.join("\n")}>{request.resources.join(" · ") || "—"}</dd>
        </div>
      </dl>
      <div className="permission-card__actions" role="toolbar" aria-label={t(state.locale, "permissionRequest")}>
        <button
          type="button"
          className={`permission-card__button permission-card__button--allow${selectedClass(0)}`}
          disabled={submitting}
          aria-pressed={selectedIndex === 0}
          onClick={() => onReply("once")}
        >
          {t(state.locale, "permissionOnce")}
        </button>
        {request.canRemember ? (
          <button
            type="button"
            className={`permission-card__button${selectedClass(1)}`}
            disabled={submitting}
            aria-pressed={selectedIndex === 1}
            onClick={() => onReply("always")}
          >
            {t(state.locale, "permissionAlways")}
          </button>
        ) : null}
        <button
          type="button"
          className={`permission-card__button permission-card__button--reject${selectedClass(request.canRemember ? 2 : 1)}`}
          disabled={submitting}
          aria-pressed={selectedIndex === (request.canRemember ? 2 : 1)}
          onClick={() => onReply("reject")}
        >
          {submitting ? t(state.locale, "permissionSubmitting") : t(state.locale, "permissionReject")}
        </button>
      </div>
      <p className="permission-card__keyboard-hint">{t(state.locale, "permissionKeyboardHint")}</p>
    </article>
  );
}
