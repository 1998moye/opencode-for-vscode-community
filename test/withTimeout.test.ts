import { describe, expect, it } from "vitest";
import { withTimeout } from "../src/utils/withTimeout.js";

describe("withTimeout", () => {
  it("在超时前返回结果", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "超时")).resolves.toBe("ok");
  });

  it("超时后拒绝", async () => {
    await expect(
      withTimeout(new Promise<string>(() => undefined), 20, "连接超时")
    ).rejects.toThrow("连接超时");
  });
});
