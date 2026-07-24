import { describe, expect, it } from "vitest";
import {
  formatConfigModel,
  selectionFromConfigModel
} from "../src/backend/gateway/configComposerSelection.js";

describe("configComposerSelection", () => {
  it("解析 provider/model 格式", () => {
    expect(selectionFromConfigModel("opencode-go/deepseek-v4-pro", "build")).toEqual({
      providerID: "opencode-go",
      modelID: "deepseek-v4-pro",
      agent: "build"
    });
  });

  it("序列化编写区选择为 model 字段", () => {
    expect(formatConfigModel({
      providerID: "opencode-go",
      modelID: "deepseek-v4-pro"
    })).toBe("opencode-go/deepseek-v4-pro");
  });
});
