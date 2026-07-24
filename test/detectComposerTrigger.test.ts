import { describe, expect, it } from "vitest";
import { applyComposerSuggestion, detectComposerTrigger } from "../webview/src/composer/detectComposerTrigger";

describe("detectComposerTrigger", () => {
  it("检测斜杠触发", () => {
    expect(detectComposerTrigger("/hel", 4)).toEqual({
      trigger: "slash",
      query: "hel",
      start: 0,
      end: 4
    });
  });

  it("检测行内提及触发", () => {
    expect(detectComposerTrigger("请查看 @src/foo", 12)).toEqual({
      trigger: "mention",
      query: "src/foo",
      start: 4,
      end: 12
    });
  });

  it("无触发时返回 undefined", () => {
    expect(detectComposerTrigger("普通文本", 4)).toBeUndefined();
  });
});

describe("applyComposerSuggestion", () => {
  it("替换触发片段", () => {
    const trigger = detectComposerTrigger("/he", 3)!;
    expect(applyComposerSuggestion("/he", trigger, "/help ")).toEqual({
      draft: "/help ",
      cursor: 6
    });
  });
});
