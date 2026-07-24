import { describe, expect, it } from "vitest";
import { createSessionParameters } from "../src/backend/gateway/sessionCreateRequest.js";

describe("OpenCode 新建会话请求", () => {
  it("不传固定标题，由 OpenCode 在首轮对话后自动命名", () => {
    const parameters = createSessionParameters("D:\\projects\\demo");

    expect(parameters).toEqual({ directory: "D:\\projects\\demo" });
    expect(parameters).not.toHaveProperty("title");
  });
});
