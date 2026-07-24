import type { OpenCodeBackend, OpenCodeConnection } from "../contracts.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";
import { discardLatePromise, withTimeout } from "../../utils/withTimeout.js";

const CONNECT_TIMEOUT_MS = 30_000;

export class ConnectionModule {
  #connection: OpenCodeConnection | undefined;
  #runId = 0;

  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly backend: OpenCodeBackend,
    private readonly trusted: boolean
  ) {}

  get current(): OpenCodeConnection | undefined {
    return this.#connection;
  }

  /**
   * 取消进行中的连接尝试，供重试时打断挂起的 connect。
   */
  cancelInitialize(): void {
    this.#runId += 1;
    void this.dispose();
  }

  async initialize(directory: string | undefined): Promise<OpenCodeConnection | undefined> {
    const runId = this.#runId;
    if (!this.trusted) {
      this.state.update({ phase: "restricted" });
      return undefined;
    }

    try {
      await this.dispose();
      if (runId !== this.#runId) {
        return undefined;
      }
      this.state.update({ phase: "checking-cli", error: undefined });
      const cli = await this.backend.inspectCli();
      if (runId !== this.#runId) {
        return undefined;
      }
      this.state.update({ cli });
      if (cli.status !== "compatible") {
        this.state.update({ phase: "error", error: "message" in cli ? cli.message : undefined });
        return undefined;
      }

      this.state.update({
        phase: "connecting",
        connection: {
          ...this.state.current.connection,
          status: "connecting",
          ownership: undefined,
          serverVersion: undefined,
          topology: undefined
        }
      });
      const pendingConnect = this.backend.connect(directory);
      let connected: OpenCodeConnection;
      try {
        connected = await withTimeout(
          pendingConnect,
          CONNECT_TIMEOUT_MS,
          "连接 OpenCode Server 超时，请点击重试。"
        );
      } catch (error) {
        discardLatePromise(pendingConnect, (lateConnection) => lateConnection.dispose());
        throw error;
      }
      if (runId !== this.#runId) {
        await connected.dispose();
        return undefined;
      }
      this.#connection = connected;
      this.state.update({
        connection: {
          status: "connected",
          ownership: this.#connection.ownership,
          serverVersion: this.#connection.serverVersion,
          topology: this.#connection.topology ?? "managed-local",
          capabilities: this.#connection.capabilities ?? allCapabilitiesEnabled()
        }
      });
      return this.#connection;
    } catch (error) {
      if (runId !== this.#runId) {
        return undefined;
      }
      this.#connection = undefined;
      this.state.update({
        phase: "error",
        connection: {
          ...this.state.current.connection,
          status: "disconnected",
          ownership: undefined,
          serverVersion: undefined,
          topology: undefined
        },
        error: error instanceof Error ? error.message : "连接 OpenCode Server 失败。"
      });
      return undefined;
    }
  }

  async dispose(): Promise<void> {
    const existing = this.#connection;
    this.#connection = undefined;
    await existing?.dispose();
  }
}

function allCapabilitiesEnabled(): import("../contracts.js").ConnectionCapabilities {
  return {
    chat: { enabled: true },
    history: { enabled: true },
    share: { enabled: true },
    fileContext: { enabled: true },
    problems: { enabled: true },
    gitDiff: { enabled: true },
    review: { enabled: true },
    revert: { enabled: true },
    pty: { enabled: true }
  };
}
