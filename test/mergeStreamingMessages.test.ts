import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/runtime/contracts.js";
import { mergeStreamingMessages } from "../src/runtime/messages/mergeStreamingMessages.js";

describe("流式消息合并", () => {
  it("服务端尚未追上本地增量时保留更长的流式文本", () => {
    const serverMessages: ChatMessage[] = [
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "你好", createdAt: 2, streaming: true }
    ];
    const localMessages: ChatMessage[] = [
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "你好，世界", createdAt: 2, streaming: true }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual([
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "你好，世界", createdAt: 2, streaming: true }
    ]);
  });

  it("服务端已完成后清除本地流式标记", () => {
    const serverMessages: ChatMessage[] = [
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "完整回复", createdAt: 2 }
    ];
    const localMessages: ChatMessage[] = [
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "完整回复", createdAt: 2, streaming: true }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual(serverMessages);
  });

  it("服务端已完成后丢弃被误拼入的本地更长文本", () => {
    const serverMessages: ChatMessage[] = [
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "故事正文", createdAt: 2 }
    ];
    const localMessages: ChatMessage[] = [
      {
        id: "assistant-1",
        sessionId: "s1",
        role: "assistant",
        text: "The user is asking me to tell them a ghost story.故事正文",
        createdAt: 2,
        streaming: true
      }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual(serverMessages);
  });

  it("保留仅存在于本地的流式占位消息", () => {
    const localMessages: ChatMessage[] = [
      { id: "assistant-new", sessionId: "s1", role: "assistant", text: "正在", createdAt: 3, streaming: true }
    ];

    expect(mergeStreamingMessages([], localMessages).messages).toEqual(localMessages);
  });

  it("服务端用户消息尚无正文时保留本地斜杠命令气泡", () => {
    const serverMessages: ChatMessage[] = [
      { id: "user-server", sessionId: "s1", role: "user", text: "", createdAt: 98 }
    ];
    const localMessages: ChatMessage[] = [
      { id: "local-1", sessionId: "s1", role: "user", text: "/view", slashCommand: "view", createdAt: 100 }
    ];

    const result = mergeStreamingMessages(serverMessages, localMessages);
    expect(result.messages).toEqual([
      { id: "user-server", sessionId: "s1", role: "user", text: "/view", slashCommand: "view", createdAt: 98 }
    ]);
    expect(result.mergedOptimisticSlash).toBe(true);
  });

  it("不会把斜杠命令贴到更早的空用户消息上", () => {
    const serverMessages: ChatMessage[] = [
      { id: "user-old", sessionId: "s1", role: "user", text: "", createdAt: 1 },
      { id: "user-new", sessionId: "s1", role: "user", text: "", createdAt: 100 }
    ];
    const localMessages: ChatMessage[] = [
      { id: "local-1", sessionId: "s1", role: "user", text: "/view", slashCommand: "view", createdAt: 99 }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual([
      { id: "user-old", sessionId: "s1", role: "user", text: "", createdAt: 1 },
      { id: "user-new", sessionId: "s1", role: "user", text: "/view", slashCommand: "view", createdAt: 100 }
    ]);
  });

  it("重复刷新时保留已补全的斜杠用户消息", () => {
    const serverMessages: ChatMessage[] = [
      { id: "user-1", sessionId: "s1", role: "user", text: "", createdAt: 10 },
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "working", createdAt: 11, streaming: true }
    ];
    const localMessages: ChatMessage[] = [
      { id: "user-1", sessionId: "s1", role: "user", text: "/init", slashCommand: "init", createdAt: 10 },
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "working...", createdAt: 11, streaming: true }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual([
      { id: "user-1", sessionId: "s1", role: "user", text: "/init", slashCommand: "init", createdAt: 10 },
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "working...", createdAt: 11, streaming: true }
    ]);
  });

  it("首条普通文字乐观消息会合并进空用户气泡", () => {
    const serverMessages: ChatMessage[] = [
      { id: "user-server", sessionId: "s1", role: "user", text: "", createdAt: 100 }
    ];
    const localMessages: ChatMessage[] = [
      { id: "local-1", sessionId: "s1", role: "user", text: "你好", createdAt: 99 }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual([
      { id: "user-server", sessionId: "s1", role: "user", text: "你好", createdAt: 100 }
    ]);
  });

  it("服务端仅有 /命令 时吸收本地带说明的乐观消息，避免双气泡", () => {
    const serverMessages: ChatMessage[] = [
      { id: "user-server", sessionId: "s1", role: "user", text: "/init", slashCommand: "init", createdAt: 100 },
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "", createdAt: 101, streaming: true }
    ];
    const localMessages: ChatMessage[] = [
      {
        id: "local-1",
        sessionId: "s1",
        role: "user",
        text: "/init 这个技能是干嘛的",
        slashCommand: "init",
        slashArguments: "这个技能是干嘛的",
        createdAt: 99
      },
      { id: "assistant-1", sessionId: "s1", role: "assistant", text: "思考中", createdAt: 101, streaming: true }
    ];

    const result = mergeStreamingMessages(serverMessages, localMessages);
    expect(result.messages.filter((message) => message.role === "user")).toEqual([
      {
        id: "user-server",
        sessionId: "s1",
        role: "user",
        text: "/init 这个技能是干嘛的",
        slashCommand: "init",
        slashArguments: "这个技能是干嘛的",
        createdAt: 100
      }
    ]);
    expect(result.mergedOptimisticSlash).toBe(true);
  });

  it("带文件上下文的乐观消息与服务端用户消息正文相同时不重复展示", () => {
    const attachmentPrefix = 'Called the read tool with the following input: {"filePath":"d:/proj/d2_练习.ts"}\n'
      + 'Called the read tool with the following input: {"filePath":"d:/proj/d3_练习.ts"}\n';
    const serverMessages: ChatMessage[] = [
      {
        id: "user-server",
        sessionId: "s1",
        role: "user",
        text: `${attachmentPrefix}这两个代码有问题吗`,
        createdAt: 100
      }
    ];
    const localMessages: ChatMessage[] = [
      { id: "local-1", sessionId: "s1", role: "user", text: "这两个代码有问题吗", createdAt: 99 }
    ];

    expect(mergeStreamingMessages(serverMessages, localMessages).messages).toEqual(serverMessages);
  });
});
