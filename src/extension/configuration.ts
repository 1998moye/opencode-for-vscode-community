import * as vscode from "vscode";
import type { Locale } from "../runtime/contracts.js";
import type { NodeOpenCodeBackendOptions } from "../backend/nodeOpenCodeBackend.js";
import type { ConnectionTopology } from "../runtime/contracts.js";
import type { PathMapping } from "../backend/topology/connectionTopology.js";
import { readExternalServerPassword, saveExternalServerPassword } from "./connectionSecretStore.js";

const CONFIGURATION_SECTION = "opencodeCommunity";
export async function readBackendOptions(
  secrets: vscode.SecretStorage,
  log: (message: string) => void,
  trusted = vscode.workspace.isTrusted
): Promise<NodeOpenCodeBackendOptions> {
  if (!trusted) {
    return {
      executable: "opencode",
      topology: "managed-local",
      pathMappings: [],
      externalUrl: "",
      externalUsername: "opencode",
      externalPassword: "",
      log
    };
  }
  const configuration = vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
  const topology = readConnectionTopology(configuration);
  return {
    executable: configuration.get<string>("executablePath")?.trim() || "opencode",
    topology,
    pathMappings: readPathMappings(configuration.get<unknown>("connection.pathMappings")),
    externalUrl: configuration.get<string>("connection.serverUrl")?.trim() ?? "",
    externalUsername: "opencode",
    externalPassword: await readExternalServerPassword(secrets),
    log
  };
}

function readConnectionTopology(configuration: vscode.WorkspaceConfiguration): ConnectionTopology {
  const inspected = configuration.inspect<ConnectionTopology>("connection.topology");
  const explicitlyConfigured = inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
  if (explicitlyConfigured) {
    return explicitlyConfigured;
  }
  const legacyMode = configuration.get<"managed" | "external">("connection.mode");
  if (legacyMode === "external") {
    return configuration.get<boolean>("connection.sameFileSystem", false)
      ? "external-same-filesystem"
      : "external-remote";
  }
  return "managed-local";
}

function readPathMappings(value: unknown): PathMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const candidate = entry as Record<string, unknown>;
    const localRoot = typeof candidate.localRoot === "string" ? candidate.localRoot.trim() : "";
    const serverRoot = typeof candidate.serverRoot === "string" ? candidate.serverRoot.trim() : "";
    return localRoot && serverRoot ? [{ localRoot, serverRoot }] : [];
  });
}

export async function setExternalServerPassword(secrets: vscode.SecretStorage): Promise<boolean> {
  const password = await vscode.window.showInputBox({
    title: "设置外部 OpenCode Server 密码",
    prompt: "密码仅保存到 VS Code SecretStorage，不会写入设置文件。",
    password: true,
    ignoreFocusOut: true
  });
  if (password === undefined) {
    return false;
  }
  await saveExternalServerPassword(secrets, password);
  return true;
}

export function resolveLocale(): Locale {
  const configured = vscode.workspace.getConfiguration(CONFIGURATION_SECTION).get<string>("language", "auto");
  if (configured === "zh-cn" || configured === "en") {
    return configured;
  }
  return vscode.env.language.toLowerCase().startsWith("zh") ? "zh-cn" : "en";
}
