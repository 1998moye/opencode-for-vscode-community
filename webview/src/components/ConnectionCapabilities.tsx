import type { ConnectionCapabilities as CapabilityState, Locale } from "../../../src/runtime/contracts";
import { t, type TranslationKey } from "../i18n";

const capabilityLabels: Array<[keyof CapabilityState, TranslationKey]> = [
  ["fileContext", "capabilityFileContext"],
  ["problems", "capabilityProblems"],
  ["gitDiff", "capabilityGitDiff"],
  ["review", "capabilityReview"],
  ["revert", "capabilityRevert"],
  ["pty", "capabilityPty"]
];

export function ConnectionCapabilities({
  locale,
  capabilities
}: {
  locale: Locale;
  capabilities: CapabilityState;
}) {
  const disabled = capabilityLabels.filter(([key]) => !capabilities[key].enabled);
  if (!capabilities.chat.enabled || disabled.length === 0) {
    return null;
  }
  const reasons = [...new Set(disabled.flatMap(([key]) => capabilities[key].reason ? [capabilities[key].reason] : []))];
  return (
    <details className="capabilities">
      <summary>{t(locale, "limitedConnection")}</summary>
      {reasons.map((reason) => <p key={reason}>{reason}</p>)}
      <div className="capabilities__disabled">
        {t(locale, "disabledCapabilities")}：{disabled.map(([, label]) => t(locale, label)).join("、")}
      </div>
    </details>
  );
}
