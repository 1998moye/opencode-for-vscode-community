import type { ConnectionTopology, OpenCodeBackend, OpenCodeConnection } from "../runtime/contracts.js";
import { inspectCliExecutable, MINIMUM_OPENCODE_VERSION } from "./cli/cliInspector.js";
import { createSdkConnection } from "./gateway/sdkConnection.js";
import { startManagedServer, type ManagedServerLifecycleHooks } from "./server/managedServer.js";
import type { PathMapping } from "./topology/connectionTopology.js";
import { validateExternalServerUrl } from "./topology/connectionTopology.js";
import { withTimeout } from "../utils/withTimeout.js";

export interface NodeOpenCodeBackendOptions {
  executable: string;
  topology?: ConnectionTopology;
  /** @deprecated 仅用于兼容 0.0.7 以前的测试和设置。 */
  mode?: "managed" | "external";
  pathMappings?: PathMapping[];
  externalUrl: string;
  externalUsername: string;
  externalPassword: string;
  log: (message: string) => void;
  managedServerLifecycle?: ManagedServerLifecycleHooks;
}

export class NodeOpenCodeBackend implements OpenCodeBackend {
  constructor(private readonly options: NodeOpenCodeBackendOptions) {}

  inspectCli() {
    if (this.connectionTopology() !== "managed-local") {
      return Promise.resolve({
        status: "compatible" as const,
        executable: "external OpenCode Server",
        version: MINIMUM_OPENCODE_VERSION
      });
    }
    return inspectCliExecutable(this.options.executable, MINIMUM_OPENCODE_VERSION);
  }

  async connect(directory: string | undefined): Promise<OpenCodeConnection> {
    const topology = this.connectionTopology();
    if (topology !== "managed-local") {
      const url = validateExternalServerUrl(this.options.externalUrl);
      this.options.log("[连接] 正在检查外部 OpenCode Server。");
      const connection = await createSdkConnection({
        baseUrl: url,
        username: this.options.externalUsername,
        password: this.options.externalPassword,
        ownership: "external",
        topology,
        localDirectory: directory,
        pathMappings: this.options.pathMappings ?? []
      });
      this.options.log(`[连接] 外部 OpenCode Server 已连接，版本 ${connection.serverVersion}。`);
      return connection;
    }

    this.options.log("[连接] 正在启动插件管理的本地 OpenCode Server。");
    const server = await startManagedServer({
      executable: this.options.executable,
      ...(directory === undefined ? {} : { directory }),
      log: this.options.log,
      lifecycle: this.options.managedServerLifecycle
    });
    this.options.log("[连接] 本地 OpenCode Server 已启动，正在执行健康检查。");
    const deadline = Date.now() + 10_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      const remainingMs = Math.max(deadline - Date.now(), 250);
      try {
        const connection = await withTimeout(
          createSdkConnection({
            baseUrl: server.url,
            username: server.username,
            password: server.password,
            ownership: "managed",
            topology: "managed-local",
            localDirectory: directory,
            pathMappings: [],
            managedServer: server
          }),
          remainingMs,
          "OpenCode Server 健康检查超时。"
        );
        this.options.log(`[连接] 本地 OpenCode Server 健康检查通过，版本 ${connection.serverVersion}。`);
        return connection;
      } catch (error) {
        lastError = error;
        const exited = await Promise.race([
          server.exited.then((code) => ({ exited: true as const, code })),
          new Promise<{ exited: false }>((resolve) => setTimeout(() => resolve({ exited: false }), 150))
        ]);
        if (exited.exited) {
          await server.dispose();
          throw new Error(`OpenCode Server 提前退出，退出码 ${exited.code ?? "未知"}。`);
        }
      }
    }
    await server.dispose();
    this.options.log(`[连接] OpenCode Server 健康检查失败：${formatError(lastError)}`);
    throw lastError instanceof Error ? lastError : new Error("OpenCode Server 健康检查超时。");
  }

  private connectionTopology(): ConnectionTopology {
    return this.options.topology ?? (this.options.mode === "external" ? "external-remote" : "managed-local");
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
