import { describe, expect, it } from "vitest";
import { validateAttachmentModalities } from "../src/runtime/context/validateAttachmentModalities.js";

describe("validateAttachmentModalities", () => {
  const catalog = {
    loaded: true,
    providers: [],
    models: [
      { id: "text-only", providerID: "openai", name: "Text", variants: [], inputModalities: ["text"], available: true },
      { id: "vision", providerID: "openai", name: "Vision", variants: [], inputModalities: ["text", "image", "pdf"], available: true }
    ],
    agents: []
  };

  it("无附件时通过", () => {
    expect(validateAttachmentModalities([], catalog, { providerID: "openai", modelID: "text-only" })).toEqual({ ok: true });
  });

  it("模型不支持图片时拒绝", () => {
    const result = validateAttachmentModalities(
      [{ id: "a", kind: "image", label: "a.png", source: { type: "attachment-file", uri: "file:///a.png", mime: "image/png" } }],
      catalog,
      { providerID: "openai", modelID: "text-only" }
    );
    expect(result.ok).toBe(false);
  });

  it("多模态模型允许 PDF", () => {
    const result = validateAttachmentModalities(
      [{ id: "a", kind: "pdf", label: "a.pdf", source: { type: "attachment-file", uri: "file:///a.pdf", mime: "application/pdf" } }],
      catalog,
      { providerID: "openai", modelID: "vision" }
    );
    expect(result).toEqual({ ok: true });
  });
});
