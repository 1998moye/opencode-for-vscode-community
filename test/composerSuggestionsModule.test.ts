import { describe, expect, it } from "vitest";
import type { ComposerSuggestionItem, OpenCodeConnection } from "../src/runtime/contracts.js";
import { ComposerSuggestionsModule } from "../src/runtime/composer/composerSuggestionsModule.js";
import { OpenCodeStateStore } from "../src/runtime/state/openCodeStateStore.js";

describe("ComposerSuggestionsModule", () => {
  it("waits for server slash commands and merges extension commands", async () => {
    let resolveServerCommands: ((items: ComposerSuggestionItem[]) => void) | undefined;
    const serverCommands = new Promise<ComposerSuggestionItem[]>((resolve) => {
      resolveServerCommands = resolve;
    });
    const connection = {
      queryComposerSuggestions: () => serverCommands
    } as unknown as OpenCodeConnection;
    const state = new OpenCodeStateStore("en", true);
    const module = new ComposerSuggestionsModule(state, () => connection);

    const pending = module.query("request-1", "slash", "");

    expect(state.current.composerSuggestions).toMatchObject({
      status: "loading",
      items: []
    });

    resolveServerCommands?.([{
      id: "slash:init",
      kind: "slash-command",
      label: "init",
      insertText: "/init "
    }]);
    await pending;

    expect(state.current.composerSuggestions).toMatchObject({
      status: "ready",
      items: [
        { label: "debug" },
        { label: "help" },
        { label: "init" },
        { label: "mcps" }
      ]
    });
  });

  it("falls back to extension slash commands when the server query fails", async () => {
    const connection = {
      queryComposerSuggestions: async () => {
        throw new Error("offline");
      }
    } as unknown as OpenCodeConnection;
    const state = new OpenCodeStateStore("en", true);
    const module = new ComposerSuggestionsModule(state, () => connection);

    await module.query("request-fallback", "slash", "");

    expect(state.current.composerSuggestions).toMatchObject({
      status: "ready",
      items: [
        { label: "help", cliCommand: "help" },
        { label: "debug", cliCommand: "debug" },
        { label: "mcps", cliCommand: "mcps" }
      ]
    });
  });

  it("回退到 initialDirectory 后 @ 仍然请求文件候选项", async () => {
    const calls: Array<{ trigger: string; query: string; directory?: string }> = [];
    const connection = {
      queryComposerSuggestions: async (trigger: "slash" | "mention", query: string, directory: string | undefined) => {
        calls.push({ trigger, query, directory });
        return [
          { id: "file:src/a.ts", kind: "file" as const, label: "src/a.ts", insertText: "@src/a.ts " }
        ];
      }
    } as unknown as OpenCodeConnection;
    const state = new OpenCodeStateStore("en", true);
    const module = new ComposerSuggestionsModule(state, () => connection, () => "/workspace/demo");

    await module.query("request-mention", "mention", "");

    expect(calls).toContainEqual({ trigger: "mention", query: "", directory: "/workspace/demo" });
    expect(state.current.composerSuggestions).toMatchObject({
      status: "ready",
      items: [{ label: "src/a.ts" }]
    });
  });
});
