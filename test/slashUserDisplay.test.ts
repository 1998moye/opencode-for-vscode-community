import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/runtime/contracts.js";
import {
  applyPendingSlashDisplays,
  applyStoredSlashDisplays,
  dedupeSlashUserMessages,
  filterSkillPromptDuplicateUserMessages,
  findBestEmptyUserIndex
} from "../src/runtime/messages/slashUserDisplay.js";

describe("slashUserDisplay", () => {
  it("把待发斜杠命令套用到最近的空用户消息", () => {
    const messages: ChatMessage[] = [
      { id: "user-old", sessionId: "s1", role: "user", text: "", createdAt: 1 },
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "ok", createdAt: 2 },
      { id: "user-new", sessionId: "s1", role: "user", text: "", createdAt: 3 }
    ];
    const result = applyPendingSlashDisplays(messages, [{ command: "view" }]);
    expect(result.messages[2]).toMatchObject({
      id: "user-new",
      text: "/view",
      slashCommand: "view"
    });
    expect(result.messages[0]).toMatchObject({ id: "user-old", text: "" });
  });

  it("按时间选择最接近的本地乐观消息对应的空用户消息", () => {
    const messages: ChatMessage[] = [
      { id: "user-old", sessionId: "s1", role: "user", text: "", createdAt: 1 },
      { id: "user-new", sessionId: "s1", role: "user", text: "", createdAt: 100 }
    ];
    const local: ChatMessage = {
      id: "local-1",
      sessionId: "s1",
      role: "user",
      text: "/view",
      slashCommand: "view",
      createdAt: 98
    };
    expect(findBestEmptyUserIndex(messages, local)).toBe(1);
  });

  it("已存储的斜杠展示在重复刷新后仍然保留", () => {
    const messages: ChatMessage[] = [
      { id: "user-1", sessionId: "s1", role: "user", text: "", createdAt: 1 }
    ];
    const stored = new Map([["user-1", { command: "view" }]]);
    expect(applyStoredSlashDisplays(messages, stored)).toMatchObject([
      { id: "user-1", text: "/view", slashCommand: "view" }
    ]);
  });

  it("去掉与带说明消息重复出现的单独斜杠气泡", () => {
    const messages: ChatMessage[] = [
      { id: "user-solo", sessionId: "s1", role: "user", text: "/init", slashCommand: "init", createdAt: 100 },
      {
        id: "user-rich",
        sessionId: "s1",
        role: "user",
        text: "/init 这个技能是干嘛的",
        slashCommand: "init",
        slashArguments: "这个技能是干嘛的",
        createdAt: 101
      }
    ];
    expect(dedupeSlashUserMessages(messages).map((message) => message.id)).toEqual(["user-rich"]);
  });

  it("仅凭正文也能识别带说明的斜杠消息并去重", () => {
    const messages: ChatMessage[] = [
      { id: "user-solo", sessionId: "s1", role: "user", text: "/init", createdAt: 100 },
      { id: "user-rich", sessionId: "s1", role: "user", text: "/init 这个技能是干嘛的", createdAt: 101 }
    ];
    expect(dedupeSlashUserMessages(messages).map((message) => message.id)).toEqual(["user-rich"]);
  });

  it("去掉与斜杠消息同时出现的技能 prompt 正文气泡", () => {
    const template = "Two-axis review of the diff between `HEAD` and a fixed point:\n\n## Process";
    const messages: ChatMessage[] = [
      {
        id: "user-slash",
        sessionId: "s1",
        role: "user",
        text: "/code-review D:\\demo\\file.ts",
        slashCommand: "code-review",
        slashArguments: "D:\\demo\\file.ts",
        createdAt: 100
      },
      { id: "user-template", sessionId: "s1", role: "user", text: template, createdAt: 101 }
    ];
    expect(filterSkillPromptDuplicateUserMessages(messages).map((message) => message.id)).toEqual(["user-slash"]);
  });

  it("去掉 grill-me 运行时信封重复气泡", () => {
    const envelope = [
      "Run a `/grilling` session.",
      "Base directory for this skill: D:\\demo\\.agents\\skills\\grill-me",
      "D:\\demo\\d3_练习.ts 这个练习代码有问题吗"
    ].join("\n");
    const messages: ChatMessage[] = [
      {
        id: "user-slash",
        sessionId: "s1",
        role: "user",
        text: "/grill-me D:\\demo\\d3_练习.ts 这个练习代码有问题吗",
        slashCommand: "grill-me",
        slashArguments: "D:\\demo\\d3_练习.ts 这个练习代码有问题吗",
        createdAt: 100
      },
      { id: "user-envelope", sessionId: "s1", role: "user", text: envelope, createdAt: 101 }
    ];
    expect(filterSkillPromptDuplicateUserMessages(messages).map((message) => message.id)).toEqual(["user-slash"]);
  });
});
