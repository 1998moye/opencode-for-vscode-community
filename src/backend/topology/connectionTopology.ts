import { posix, win32 } from "node:path";
import type { ConnectionCapabilities, ConnectionTopology } from "../../runtime/contracts.js";

export interface PathMapping {
  localRoot: string;
  serverRoot: string;
}

export interface PathCapabilityEvaluation {
  serverDirectory?: string | undefined;
  capabilities: ConnectionCapabilities;
}

export function evaluatePathCapabilities(options: {
  topology: ConnectionTopology;
  localDirectory?: string | undefined;
  serverDirectory?: string | undefined;
  mappings: PathMapping[];
}): PathCapabilityEvaluation {
  if (options.topology === "managed-local") {
    return { serverDirectory: options.localDirectory, capabilities: fullLocalCapabilities() };
  }
  if (!options.localDirectory || !options.serverDirectory) {
    return {
      capabilities: degradedRemoteCapabilities("无法同时取得 VS Code 与 OpenCode Server 的当前目录。")
    };
  }
  if (options.topology === "external-same-filesystem") {
    if (pathsEquivalent(options.localDirectory, options.serverDirectory)) {
      return { serverDirectory: options.serverDirectory, capabilities: fullLocalCapabilities() };
    }
    return {
      capabilities: degradedRemoteCapabilities("同文件系统声明未通过规范化路径验证。")
    };
  }
  const mapped = mapLocalPathToServer(options.localDirectory, options.mappings);
  if (!mapped) {
    return {
      capabilities: degradedRemoteCapabilities("远程服务没有覆盖当前会话目录的已验证路径映射。")
    };
  }
  if (!pathsEquivalent(mapped, options.serverDirectory)) {
    return {
      capabilities: degradedRemoteCapabilities("OpenCode Server 返回的目录与配置的路径映射不一致。")
    };
  }
  return {
    serverDirectory: mapped,
    capabilities: degradedRemoteCapabilities("路径映射尚未通过读写探测，文件能力保持禁用。")
  };
}

export function validateExternalServerUrl(value: string): string {
  if (!value) {
    throw new Error("外部连接拓扑必须先配置 OpenCode Server 地址。");
  }
  const url = new URL(value);
  const loopback = isLoopbackHost(url.hostname);
  if (!loopback && url.protocol !== "https:") {
    throw new Error("非回环 OpenCode Server 必须使用 HTTPS。请先配置安全隧道或 TLS。");
  }
  if (loopback && url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OpenCode Server 地址必须使用 HTTP 或 HTTPS。");
  }
  return url.toString().replace(/\/$/, "");
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

export function fullLocalCapabilities(): ConnectionCapabilities {
  return mapCapabilities(true);
}

export function degradedRemoteCapabilities(reason: string): ConnectionCapabilities {
  return {
    chat: { enabled: true },
    history: { enabled: true },
    share: { enabled: true },
    fileContext: { enabled: false, reason },
    problems: { enabled: false, reason },
    gitDiff: { enabled: false, reason },
    review: { enabled: false, reason },
    revert: { enabled: false, reason },
    pty: { enabled: false, reason }
  };
}

export function mapLocalPathToServer(localPath: string, mappings: PathMapping[]): string | undefined {
  const localPathApi = pathApi(localPath);
  const absoluteLocalPath = localPathApi.normalize(localPathApi.resolve(localPath));
  const candidates = mappings
    .filter((mapping) => mapping.localRoot.trim() && mapping.serverRoot.trim())
    .map((mapping) => ({
      mapping,
      relativePath: localPathApi.relative(localPathApi.normalize(localPathApi.resolve(mapping.localRoot)), absoluteLocalPath)
    }))
    .filter(({ relativePath }) => relativePath === "" || (
      !relativePath.startsWith(`..${localPathApi.sep}`) && relativePath !== ".." && !localPathApi.isAbsolute(relativePath)
    ))
    .sort((left, right) => right.mapping.localRoot.length - left.mapping.localRoot.length);
  const match = candidates[0];
  if (!match) {
    return undefined;
  }
  const serverPathApi = pathApi(match.mapping.serverRoot);
  const relativeSegments = match.relativePath.split(localPathApi.sep).filter(Boolean);
  return serverPathApi.normalize(serverPathApi.resolve(match.mapping.serverRoot, ...relativeSegments));
}

export function pathsEquivalent(left: string, right: string): boolean {
  const leftApi = pathApi(left);
  const rightApi = pathApi(right);
  if (leftApi !== rightApi) {
    return false;
  }
  const normalizeForComparison = (value: string): string => {
    const normalized = leftApi.normalize(leftApi.resolve(value)).replace(/[\\/]+$/, "");
    return leftApi === win32 ? normalized.toLowerCase() : normalized;
  };
  return normalizeForComparison(left) === normalizeForComparison(right);
}

function pathApi(value: string): typeof win32 | typeof posix {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") ? win32 : posix;
}

function mapCapabilities(enabled: boolean): ConnectionCapabilities {
  return {
    chat: { enabled },
    history: { enabled },
    share: { enabled },
    fileContext: { enabled },
    problems: { enabled },
    gitDiff: { enabled },
    review: { enabled },
    revert: { enabled },
    pty: { enabled }
  };
}
