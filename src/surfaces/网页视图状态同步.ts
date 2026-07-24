import type { OpenCodeRuntime, OpenCodeState } from "../runtime/contracts.js";
import type { HostToWebviewMessage } from "./surfaceProtocol.js";

export class 网页视图状态同步 {
  #latestState: OpenCodeState | undefined;
  #ready = false;
  readonly #unsubscribe: () => void;

  constructor(
    runtime: OpenCodeRuntime,
    private readonly post: (message: HostToWebviewMessage) => void
  ) {
    this.#unsubscribe = runtime.subscribe((state) => {
      this.#latestState = state;
      if (this.#ready) {
        this.发送最新状态();
      }
    });
  }

  页面已就绪(): void {
    this.#ready = true;
    this.发送最新状态();
  }

  dispose(): void {
    this.#ready = false;
    this.#unsubscribe();
  }

  private 发送最新状态(): void {
    if (this.#latestState) {
      this.post({ type: "state", state: this.#latestState });
    }
  }
}
