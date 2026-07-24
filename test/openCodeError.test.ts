import { describe, expect, it } from "vitest";
import { readOpenCodeErrorMessage } from "../src/backend/gateway/messageMapper.js";

describe("readOpenCodeErrorMessage", () => {
  it("提取 session.error 的服务端详情", () => {
    expect(readOpenCodeErrorMessage({
      name: "APIError",
      data: { message: "Inference capacity queue is full", statusCode: 503 }
    })).toBe("Inference capacity queue is full");
  });

  it("无法识别时不伪造详情", () => {
    expect(readOpenCodeErrorMessage({ data: {} })).toBeUndefined();
  });
});
