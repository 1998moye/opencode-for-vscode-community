import type { OpenCodeState } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { postToHost } from "../vscodeApi";

export function ConnectionStatus({ state }: { state: OpenCodeState }) {
  if (state.phase === "ready") {
    return (
      <div className="connection connection--ready">
        <span className="connection__dot" />
        {t(state.locale, "ready")} · OpenCode {state.connection.serverVersion}
      </div>
    );
  }

  if (state.connection.status === "connected" && state.connection.serverVersion) {
    return (
      <div className="connection connection--ready">
        <span className="connection__dot connection__dot--pulse" />
        {t(state.locale, "loadingSessions")} · OpenCode {state.connection.serverVersion}
      </div>
    );
  }

  let label = t(state.locale, "error");
  if (state.phase === "idle") label = t(state.locale, "preparing");
  if (state.phase === "restricted") label = t(state.locale, "restricted");
  if (state.phase === "checking-cli") label = t(state.locale, "checking");
  if (state.phase === "connecting") label = t(state.locale, "connecting");
  if (state.cli.status === "missing") label = t(state.locale, "missing");
  if (state.cli.status === "incompatible") label = t(state.locale, "incompatible");

  const canRetry = state.phase !== "restricted";

  return (
    <div className="connection connection--problem">
      <span>{state.error || label}</span>
      {canRetry && (
        <button className="button button--quiet" onClick={() => postToHost({ type: "retry" })}>
          {t(state.locale, "retry")}
        </button>
      )}
    </div>
  );
}
