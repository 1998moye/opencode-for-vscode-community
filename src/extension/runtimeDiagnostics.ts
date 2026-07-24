import type { OpenCodeRuntime, OpenCodeState } from "../runtime/contracts.js";
import { redactShareUrls } from "../runtime/sessions/sanitizeShareError.js";

export interface RuntimeDiagnosticsSubscription {
  dispose(): void;
}

export function subscribeToRuntimeDiagnostics(
  runtime: OpenCodeRuntime,
  log: (message: string) => void
): RuntimeDiagnosticsSubscription {
  let previousLine: string | undefined;
  const unsubscribe = runtime.subscribe((state) => {
    const line = formatRuntimeDiagnostic(state);
    if (line === previousLine) {
      return;
    }
    previousLine = line;
    log(line);
  });
  return { dispose: unsubscribe };
}

export function formatRuntimeDiagnostic(state: OpenCodeState): string {
  const details = [`阶段=${state.phase}`, `CLI=${state.cli.status}`, `连接=${state.connection.status}`];
  if (state.cli.status === "compatible") {
    details.push(`CLI版本=${state.cli.version}`);
  }
  if (state.connection.serverVersion) {
    details.push(`Server版本=${state.connection.serverVersion}`);
  }
  if (state.connection.topology) {
    details.push(`拓扑=${state.connection.topology}`);
    const disabled = Object.values(state.connection.capabilities).filter((capability) => !capability.enabled).length;
    details.push(`受限能力=${disabled}`);
  }
  if (state.error) {
    details.push(`错误=${redactShareUrls(state.error)}`);
  }
  return `[运行状态] ${details.join("；")}`;
}
