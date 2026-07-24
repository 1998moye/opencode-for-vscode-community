import { describe, expect, it } from "vitest";
import type { ModelCatalog } from "../src/runtime/contracts.js";
import { validateComposerSelection } from "../src/runtime/catalog/validateComposerSelection.js";

const catalog: ModelCatalog = {
  loaded: true,
  providers: [{ id: "openai", name: "OpenAI", connected: true }],
  models: [{
    id: "gpt-4",
    providerID: "openai",
    name: "GPT-4",
    variants: ["fast", "quality"],
    inputModalities: ["text"],
    available: true
  }],
  agents: [{ id: "build", name: "build", hidden: false, mode: "primary" }]
};

describe("validateComposerSelection", () => {
  it("保留有效选择", () => {
    const result = validateComposerSelection({
      providerID: "openai",
      modelID: "gpt-4",
      variant: "fast",
      agent: "build"
    }, catalog);

    expect(result.changed).toBe(false);
    expect(result.selection).toEqual({
      providerID: "openai",
      modelID: "gpt-4",
      variant: "fast",
      agent: "build"
    });
  });

  it("模型失效时清除并说明原因", () => {
    const result = validateComposerSelection({
      providerID: "openai",
      modelID: "missing",
      agent: "build"
    }, catalog);

    expect(result.selection.modelID).toBeUndefined();
    expect(result.selection.notice).toBe("先前选择的模型已不可用。");
  });

  it("未解锁模型时清除并提示连接供应商", () => {
    const lockedCatalog: ModelCatalog = {
      ...catalog,
      providers: [{ id: "zen", name: "OpenCode Zen", connected: true }],
      models: [{
        id: "claude",
        providerID: "zen",
        name: "Claude Sonnet",
        variants: [],
        inputModalities: ["text"],
        available: false
      }]
    };
    const result = validateComposerSelection({
      providerID: "zen",
      modelID: "claude"
    }, lockedCatalog);

    expect(result.selection.modelID).toBeUndefined();
    expect(result.selection.notice).toBe("先前选择的模型尚未解锁，请先连接供应商。");
  });

  it("无效变体时静默恢复默认变体且不提示", () => {
    const result = validateComposerSelection({
      providerID: "openai",
      modelID: "gpt-4",
      variant: "stale-variant"
    }, catalog);

    expect(result.changed).toBe(true);
    expect(result.selection.variant).toBeUndefined();
    expect(result.selection.notice).toBeUndefined();
    expect(result.selection.modelID).toBe("gpt-4");
  });
});
