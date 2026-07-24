import { create } from "zustand";
import type { HostToWebviewMessage } from "../../src/surfaces/surfaceProtocol";
import type { OpenCodeIntent, OpenCodeState } from "../../src/runtime/contracts";
import { postToHost } from "./vscodeApi";

interface ChatStore {
  state: OpenCodeState;
  receive(message: HostToWebviewMessage): void;
  dispatch(intent: OpenCodeIntent): void;
}

const initialState: OpenCodeState = {
  phase: "idle",
  locale: "zh-cn",
  trusted: true,
  cli: { status: "unknown" },
  connection: {
    status: "disconnected",
    ownership: undefined,
    serverVersion: undefined,
    topology: undefined,
    capabilities: {
      chat: { enabled: false }, history: { enabled: false }, share: { enabled: false }, fileContext: { enabled: false },
      problems: { enabled: false }, gitDiff: { enabled: false }, review: { enabled: false },
      revert: { enabled: false }, pty: { enabled: false }
    }
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

export const useChatStore = create<ChatStore>((set) => ({
  state: initialState,
  receive: (message) => set({ state: message.state }),
  dispatch: (intent) => postToHost({ type: "intent", intent })
}));

export function connectHostMessages(): () => void {
  const receive = (event: MessageEvent<HostToWebviewMessage>): void => {
    if (event.data?.type === "state") {
      useChatStore.getState().receive(event.data);
    }
  };
  window.addEventListener("message", receive);
  return () => window.removeEventListener("message", receive);
}
