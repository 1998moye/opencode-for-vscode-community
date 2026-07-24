import type { Locale, SessionRuntimeStatus } from "../../../src/runtime/contracts";
import { t, type TranslationKey } from "../i18n";

const statusKeys: Record<SessionRuntimeStatus["status"], TranslationKey> = {
  idle: "statusIdle",
  running: "statusRunning",
  following: "statusFollowing",
  "waiting-permission": "statusWaitingPermission",
  completed: "statusCompleted",
  failed: "statusFailed",
  interrupted: "statusInterrupted"
};

export function formatSessionStatus(locale: Locale, status: SessionRuntimeStatus | undefined): string {
  if (!status) {
    return t(locale, "statusIdle");
  }
  const label = t(locale, statusKeys[status.status]);
  return status.detail ? `${label} · ${status.detail}` : label;
}

export function SessionStatusBar({ locale, status }: { locale: Locale; status: SessionRuntimeStatus | undefined }) {
  if (!status || status.status === "idle") {
    return null;
  }
  return <div className={`session-status session-status--${status.status}`}>{formatSessionStatus(locale, status)}</div>;
}
