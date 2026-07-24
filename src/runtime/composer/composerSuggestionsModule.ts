import type { ComposerSuggestionsState, OpenCodeConnection } from "../contracts.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";
import { withTimeout } from "../../utils/withTimeout.js";
import { findExtensionSlashCommandSuggestions } from "./cliBuiltinCommands.js";
import { mergeSlashCommandSuggestions } from "./slashCommandCatalog.js";

const SUGGESTION_QUERY_TIMEOUT_MS = 5_000;

const idleSuggestions = (): ComposerSuggestionsState => ({
  requestId: "",
  trigger: "slash" as const,
  query: "",
  status: "idle" as const,
  items: []
});

/**
 * 管理编写区斜杠命令与 @ 提及的异步补全结果。
 */
export class ComposerSuggestionsModule {
  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly connection: () => OpenCodeConnection | undefined,
    private readonly fallbackDirectory: () => string | undefined = () => undefined
  ) {}

  reset(): void {
    this.state.update({ composerSuggestions: idleSuggestions() });
  }

  async query(requestId: string, trigger: "slash" | "mention", query: string): Promise<void> {
    this.state.update({
      composerSuggestions: {
        requestId,
        trigger,
        query,
        status: "loading",
        items: []
      }
    });
    const connection = this.connection();
    if (!connection?.queryComposerSuggestions) {
      const items = trigger === "slash"
        ? mergeSlashCommandSuggestions([], query)
        : [];
      if (items.length === 0) {
        this.state.update({
          composerSuggestions: {
            requestId,
            trigger,
            query,
            status: "error",
            items: [],
            error: "当前 OpenCode Server 不支持输入补全。"
          }
        });
        return;
      }
      this.state.update({
        composerSuggestions: {
          requestId,
          trigger,
          query,
          status: "ready",
          items
        }
      });
      return;
    }
    const directory = this.state.current.sessions.find((session) => session.id === this.state.current.activeSessionId)?.directory ?? this.fallbackDirectory();
    try {
      const serverItems = await withTimeout(
        connection.queryComposerSuggestions(trigger, query, directory, this.state.current.catalog),
        SUGGESTION_QUERY_TIMEOUT_MS,
        "OpenCode command suggestions timed out."
      );
      if (this.state.current.composerSuggestions.requestId !== requestId) {
        return;
      }
      const items = trigger === "slash"
        ? mergeSlashCommandSuggestions(serverItems, query)
        : serverItems;
      this.state.update({
        composerSuggestions: {
          requestId,
          trigger,
          query,
          status: "ready",
          items
        }
      });
    } catch (error) {
      if (this.state.current.composerSuggestions.requestId !== requestId) {
        return;
      }
      const fallbackItems = trigger === "slash"
        ? findExtensionSlashCommandSuggestions(query)
        : [];
      if (fallbackItems.length > 0) {
        this.state.update({
          composerSuggestions: {
            requestId,
            trigger,
            query,
            status: "ready",
            items: fallbackItems
          }
        });
        return;
      }
      this.state.update({
        composerSuggestions: {
          requestId,
          trigger,
          query,
          status: "error",
          items: [],
          error: error instanceof Error ? error.message : "加载补全失败。"
        }
      });
    }
  }
}
