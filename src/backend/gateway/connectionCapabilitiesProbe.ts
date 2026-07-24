import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { ConnectionCapability, ConnectionCapabilities, ConnectionTopology } from "../../runtime/contracts.js";
import {
  evaluatePathCapabilities,
  fullLocalCapabilities,
  mapLocalPathToServer,
  type PathMapping
} from "../topology/connectionTopology.js";
import { dataOf } from "./sdkRequest.js";

/**
 * 根据 OpenCode 配置判断会话分享是否可用。
 */
export async function probeShareCapability(client: OpencodeClient): Promise<ConnectionCapability> {
  try {
    const config = await dataOf(client.config.get({}));
    if (config.share === "disabled") {
      return { enabled: false, reason: "OpenCode 配置已禁用会话分享。" };
    }
    return { enabled: true };
  } catch {
    return { enabled: true };
  }
}

export async function inspectConnectionCapabilities(
  client: OpencodeClient,
  options: {
    topology: ConnectionTopology;
    localDirectory?: string | undefined;
    pathMappings: PathMapping[];
  }
): Promise<ConnectionCapabilities> {
  const share = await probeShareCapability(client);
  if (options.topology === "managed-local") {
    return { ...fullLocalCapabilities(), share };
  }
  const requestedDirectory = options.topology === "external-remote" && options.localDirectory
    ? mapLocalPathToServer(options.localDirectory, options.pathMappings)
    : options.localDirectory;
  if (!requestedDirectory) {
    return { ...evaluate(options).capabilities, share };
  }
  try {
    const paths = await dataOf(client.path.get({ directory: requestedDirectory }));
    return { ...evaluatePathCapabilities({
      ...options,
      serverDirectory: paths.directory,
      mappings: options.pathMappings
    }).capabilities, share };
  } catch {
    return { ...evaluate(options).capabilities, share };
  }
}

function evaluate(options: {
  topology: ConnectionTopology;
  localDirectory?: string | undefined;
  pathMappings: PathMapping[];
}) {
  return evaluatePathCapabilities({
    topology: options.topology,
    localDirectory: options.localDirectory,
    mappings: options.pathMappings
  });
}
