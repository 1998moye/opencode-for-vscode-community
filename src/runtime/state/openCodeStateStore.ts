import type { Locale, OpenCodeState } from "../contracts.js";

export class OpenCodeStateStore {
  readonly #listeners = new Set<(state: OpenCodeState) => void>();
  #state: OpenCodeState;

  constructor(locale: Locale, trusted: boolean) {
    this.#state = {
      phase: "idle",
      locale,
      trusted,
      cli: { status: "unknown" },
      connection: {
        status: "disconnected",
        ownership: undefined,
        serverVersion: undefined,
        topology: undefined,
        capabilities: unavailableCapabilities("尚未连接 OpenCode Server。")
      },
      sessions: [],
      activeSessionId: undefined,
      messages: [],
      draft: "",
      busySessionIds: [],
      sessionStatuses: {},
      permissions: [],
      questions: [],
      catalog: { loaded: false, providers: [], models: [], agents: [] },
      composerSelection: {},
      composerPreference: {},
      contextItems: [],
      composerSuggestions: {
        requestId: "",
        trigger: "slash",
        query: "",
        status: "idle",
        items: []
      },
      changeReview: { status: "idle", entries: [] },
      error: undefined
    };
  }

  get current(): OpenCodeState {
    return this.#state;
  }

  update(patch: Partial<OpenCodeState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) {
      listener(this.#state);
    }
  }

  subscribe(listener: (state: OpenCodeState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  resync(): void {
    for (const listener of this.#listeners) {
      listener(this.#state);
    }
  }

  clearListeners(): void {
    this.#listeners.clear();
  }
}

function unavailableCapabilities(reason: string): OpenCodeState["connection"]["capabilities"] {
  return {
    chat: { enabled: false, reason },
    history: { enabled: false, reason },
    share: { enabled: false, reason },
    fileContext: { enabled: false, reason },
    problems: { enabled: false, reason },
    gitDiff: { enabled: false, reason },
    review: { enabled: false, reason },
    revert: { enabled: false, reason },
    pty: { enabled: false, reason }
  };
}
