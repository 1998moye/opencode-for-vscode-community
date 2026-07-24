import { describe, expect, it } from "vitest";
import { formatContextChipLabel } from "../webview/src/composer/contextChipLabel";

describe("formatContextChipLabel", () => {
  it("仅展示文件名而非完整路径", () => {
    expect(formatContextChipLabel({
      id: "1",
      kind: "image",
      label: "c:\\Users\\demo\\Desktop\\shot.png",
      source: { type: "attachment-file", uri: "file:///c:/Users/demo/Desktop/shot.png", mime: "image/png" }
    })).toBe("shot.png");
  });
});
