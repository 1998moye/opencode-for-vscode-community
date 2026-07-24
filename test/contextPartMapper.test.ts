import { describe, expect, it } from "vitest";
import { mapContextParts } from "../src/backend/gateway/contextPartMapper.js";
import { validateAttachmentModalities } from "../src/runtime/context/validateAttachmentModalities.js";

describe("regular file attachments", () => {
  it("keeps a regular file attachment as an OpenCode file part", () => {
    expect(mapContextParts([{
      type: "file",
      mime: "text/typescript",
      url: "file:///D:/project/example.ts",
      filename: "example.ts"
    }])).toEqual([{
      type: "file",
      mime: "text/typescript",
      url: "file:///D:/project/example.ts",
      filename: "example.ts"
    }]);
  });

  it("does not require image or PDF capability", () => {
    const catalog = {
      loaded: true,
      providers: [],
      models: [{ id: "text-only", providerID: "openai", name: "Text", variants: [], inputModalities: ["text"] as const, available: true }],
      agents: []
    };
    expect(validateAttachmentModalities([{
      id: "attachment-file-example-ts",
      kind: "attachment",
      label: "example.ts",
      source: { type: "attachment-file", uri: "file:///D:/project/example.ts", mime: "text/typescript" }
    }], catalog, { providerID: "openai", modelID: "text-only" })).toEqual({ ok: true });
  });
});
