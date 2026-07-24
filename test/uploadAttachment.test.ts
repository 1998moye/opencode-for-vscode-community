import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "../webview/src/composer/uploadAttachment";

describe("uploadAttachment", () => {
  it("将字节编码为 base64", () => {
    expect(bytesToBase64(new TextEncoder().encode("hi"))).toBe("aGk=");
  });
});
