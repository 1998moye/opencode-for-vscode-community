import { describe, expect, it } from "vitest";
import { ContextModule } from "../src/runtime/context/contextModule.js";
import { OpenCodeStateStore } from "../src/runtime/state/openCodeStateStore.js";

describe("ContextModule", () => {
  it("自动选区只替换 auto 项，不影响手动上下文", () => {
    const state = new OpenCodeStateStore("zh-cn", true);
    const context = new ContextModule(state);
    state.update({
      contextItems: [{
        id: "manual-file",
        kind: "file",
        label: "a.ts",
        source: { type: "file", uri: "file:///a.ts" }
      }]
    });

    context.syncAutoSelection({
      id: ContextModule.autoSelectionId(),
      kind: "selection",
      label: "b.ts",
      auto: true,
      source: {
        type: "editor-selection",
        uri: "file:///b.ts",
        startLine: 0,
        startCharacter: 0,
        endLine: 0,
        endCharacter: 1
      }
    });

    expect(state.current.contextItems.map((item) => item.id)).toEqual(["manual-file", ContextModule.autoSelectionId()]);
  });

  it("发送成功后清除手动上下文并保留自动选区", () => {
    const state = new OpenCodeStateStore("zh-cn", true);
    const context = new ContextModule(state);
    state.update({
      contextItems: [
        { id: "manual", kind: "file", label: "a.ts", source: { type: "file", uri: "file:///a.ts" } },
        { id: ContextModule.autoSelectionId(), kind: "selection", label: "b.ts", auto: true, source: { type: "editor-selection", uri: "file:///b.ts", startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 1 } }
      ]
    });

    context.clearAfterSend();

    expect(state.current.contextItems.map((item) => item.id)).toEqual([ContextModule.autoSelectionId()]);
  });
});
