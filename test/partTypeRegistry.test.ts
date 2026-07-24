import { describe, expect, it } from "vitest";
import { PartTypeRegistry } from "../src/backend/gateway/partTypeRegistry.js";

describe("分片类型注册表", () => {
  it("仅将 text 分片识别为正文增量来源", () => {
    const registry = new PartTypeRegistry();
    registry.remember({ id: "text-part", type: "text" });
    registry.remember({ id: "reasoning-part", type: "reasoning" });

    expect(registry.isTextPart("text-part")).toBe(true);
    expect(registry.isTextPart("reasoning-part")).toBe(false);
    expect(registry.isTextPart("unknown-part")).toBe(false);
  });

  it("移除分片后不再识别为正文", () => {
    const registry = new PartTypeRegistry();
    registry.remember({ id: "text-part", type: "text" });
    registry.forget("text-part");

    expect(registry.isTextPart("text-part")).toBe(false);
  });
});
