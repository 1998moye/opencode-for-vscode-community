import { describe, expect, it } from "vitest";
import {
  extractTrailingUserArgsFromSkillEnvelope,
  looksLikeSkillPromptBody,
  looksLikeSkillRuntimeEnvelope
} from "../src/runtime/messages/skillPromptDisplay.js";

describe("looksLikeSkillPromptBody", () => {
  it("识别带 Markdown 标题的技能正文", () => {
    const body = "Two-axis review of the diff between `HEAD` and a fixed point:\n\n## Process\n\n### 1. Pin";
    expect(looksLikeSkillPromptBody(body)).toBe(true);
  });

  it("普通长文字不应被当成技能模板", () => {
    const longText = "This version of the \"Kimi Code 仪表盘\" extension was published by 1998moye. "
      + "That user account is not a verified publisher of the namespace \"Dingzhen\" of this extension. "
      + "See the documentation to learn how we handle namespaces and what you can do to eliminate this warning.";
    expect(looksLikeSkillPromptBody(longText)).toBe(false);
  });
});

describe("looksLikeSkillRuntimeEnvelope", () => {
  it("识别 grill-me 注入的运行时信封", () => {
    const envelope = [
      "Run a `/grilling` session.",
      "",
      "Base directory for this skill: D:\\projects\\agent_study\\.agents\\skills\\grill-me",
      "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
      "",
      "D:\\projects\\agent_study\\projects\\01-api-tool\\d3_练习.ts 这个练习代码有问题吗"
    ].join("\n");
    expect(looksLikeSkillRuntimeEnvelope(envelope)).toBe(true);
    expect(extractTrailingUserArgsFromSkillEnvelope(envelope)).toBe(
      "D:\\projects\\agent_study\\projects\\01-api-tool\\d3_练习.ts 这个练习代码有问题吗"
    );
  });
});
