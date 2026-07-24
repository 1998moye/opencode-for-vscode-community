import { describe, expect, it } from "vitest";
import { userMessageComparableText, userMessagesSemanticallyEqual } from "../src/runtime/messages/userMessageComparableText.js";

describe("userMessageComparableText", () => {
  it("去掉文件工具前缀后比较用户正文", () => {
    const withFiles = 'Called the read tool with the following input: {"filePath":"a.ts"}\n你好';
    expect(userMessageComparableText(withFiles)).toBe("你好");
    expect(userMessagesSemanticallyEqual(withFiles, "你好")).toBe(true);
  });
});
