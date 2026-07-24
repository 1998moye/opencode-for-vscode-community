import { describe, expect, it } from "vitest";
import { mapOpenCodeMessage } from "../src/backend/gateway/messageMapper.js";

describe("mapOpenCodeMessage", () => {
  it("does not create a visible assistant message for a completed tool-only record", () => {
    expect(mapOpenCodeMessage({
      info: { id: "tool-only", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: []
    } as never)).toBeUndefined();
  });

  it("does not create a visible assistant message for an unfinished tool-only record", () => {
    expect(mapOpenCodeMessage({
      info: { id: "tool-pending", sessionID: "session", role: "assistant", time: { created: 1 } },
      parts: []
    } as never)).toBeUndefined();
  });

  it("maps a tool part into a visible execution step", () => {
    expect(mapOpenCodeMessage({
      info: { id: "tool", sessionID: "session", role: "assistant", time: { created: 1 } },
      parts: [{
        id: "part", sessionID: "session", messageID: "tool", type: "tool", callID: "call", tool: "Read",
        state: { status: "pending", input: { filePath: "d:/demo/file.ts" }, raw: "{}" }
      }]
    } as never)).toMatchObject({
      id: "tool",
      steps: [{ type: "tool", label: "Read", status: "pending", input: expect.stringContaining("file.ts") }]
    });
  });

  it("preserves an assistant error even when it has no text", () => {
    expect(mapOpenCodeMessage({
      info: {
        id: "failed", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 },
        error: { message: "Tool failed" }
      },
      parts: []
    } as never)).toMatchObject({ id: "failed", error: "Tool failed" });
  });

  it("Write 工具的输入展示写入的代码原文，而不是 (N 字符,M 行) 占位", () => {
    const code = "export function add(a: number, b: number) {\n  return a + b;\n}\n";
    const result = mapOpenCodeMessage({
      info: { id: "write", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: [{
        id: "p", sessionID: "session", messageID: "write", type: "tool", callID: "c", tool: "Write",
        state: { status: "completed", input: { file_path: "d:/demo/add.ts", content: code }, output: "Wrote file successfully.", raw: "{}" }
      }]
    } as never);
    const input = result?.steps?.[0]?.input;
    expect(input).toBeTruthy();
    expect(input).toContain("export function add");
    expect(input).not.toMatch(/\(\d+ 字符/);
  });

  it("Bash 工具的输入只展示命令原文", () => {
    const result = mapOpenCodeMessage({
      info: { id: "bash", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: [{
        id: "p", sessionID: "session", messageID: "bash", type: "tool", callID: "c", tool: "Bash",
        state: { status: "completed", input: { command: "git status" }, output: "nothing to commit", raw: "{}" }
      }]
    } as never);
    expect(result?.steps?.[0]?.input).toBe("git status");
  });

  it("todowrite 工具的输入展示待办清单而不是 JSON", () => {
    const result = mapOpenCodeMessage({
      info: { id: "todo", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: [{
        id: "p", sessionID: "session", messageID: "todo", type: "tool", callID: "c", tool: "todowrite",
        state: {
          status: "completed",
          input: {
            todos: [
              { content: "删除 current-time.ts", status: "pending", priority: "high" },
              { content: "重写文件", status: "in_progress", priority: "medium" }
            ]
          },
          output: "Updated todos",
          raw: "{}"
        }
      }]
    } as never);
    expect(result?.steps?.[0]?.input).toContain("[ ] 删除 current-time.ts");
    expect(result?.steps?.[0]?.input).toContain("[~] 重写文件");
    expect(result?.steps?.[0]?.input).not.toContain('"content"');
  });

  it("Edit 工具展示 content 字段写入的文档内容，并隐藏成功短句 output", () => {
    const markdown = "# 变更记录\n\n- 完成某项工作";
    const result = mapOpenCodeMessage({
      info: { id: "edit", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: [{
        id: "p", sessionID: "session", messageID: "edit", type: "tool", callID: "c", tool: "edit",
        state: {
          status: "completed",
          input: { file_path: "D:/demo/变更记录.md", content: markdown },
          output: "Edit applied successfully.",
          raw: "{}"
        }
      }]
    } as never);
    expect(result?.steps?.[0]?.input).toContain("--- 新 ---");
    expect(result?.steps?.[0]?.input).toContain("# 变更记录");
    expect(result?.steps?.[0]?.output).toBeUndefined();
  });

  it("Read 工具的输出解析 XML 并去掉行号", () => {
    const result = mapOpenCodeMessage({
      info: { id: "read", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: [{
        id: "p", sessionID: "session", messageID: "read", type: "tool", callID: "c", tool: "read",
        state: {
          status: "completed",
          input: { file_path: "D:/demo/ask.ts" },
          output: "<path>D:/demo/ask.ts</path>\n<content>\n     1|const x = 1;\n</content>",
          raw: "{}"
        }
      }]
    } as never);
    expect(result?.steps?.[0]?.output).toContain("D:/demo/ask.ts");
    expect(result?.steps?.[0]?.output).toContain("const x = 1;");
    expect(result?.steps?.[0]?.output).not.toContain("<path>");
    expect(result?.steps?.[0]?.output).not.toContain("1|");
  });

  it("Read 工具输出支持冒号行号前缀", () => {
    const result = mapOpenCodeMessage({
      info: { id: "read-md", sessionID: "session", role: "assistant", time: { created: 1, completed: 2 } },
      parts: [{
        id: "p", sessionID: "session", messageID: "read-md", type: "tool", callID: "c", tool: "read",
        state: {
          status: "completed",
          input: { file_path: "D:/demo/变更记录.md" },
          output: "<path>D:/demo/变更记录.md</path>\n<content>\n1: # Title\n2: Hello\n</content>",
          raw: "{}"
        }
      }]
    } as never);
    expect(result?.steps?.[0]?.output).toContain("# Title");
    expect(result?.steps?.[0]?.output).not.toContain("1:");
  });

  it("用户斜杠命令消息从 subtask 分片还原展示文本", () => {
    expect(mapOpenCodeMessage({
      info: { id: "slash-user", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [{
        id: "subtask", sessionID: "session", messageID: "slash-user", type: "subtask",
        prompt: "You are a code reviewer. Your job is to review code changes and provide feedback.",
        description: "task review",
        agent: "review",
        command: "review"
      }]
    } as never)).toMatchObject({
      id: "slash-user",
      role: "user",
      text: "/review",
      slashCommand: "review",
      slashDetail: "task review"
    });
  });

  it("无 command 字段的技能从 agent 推断斜杠命令", () => {
    expect(mapOpenCodeMessage({
      info: { id: "view-user", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [{
        id: "subtask", sessionID: "session", messageID: "view-user", type: "subtask",
        prompt: "Explore this repository and summarize the architecture.",
        description: "task view",
        agent: "view"
      }]
    } as never)).toMatchObject({
      text: "/view",
      slashCommand: "view",
      slashDetail: "task view"
    });
  });

  it("仅 text 分片的斜杠询问保留用户附加说明", () => {
    expect(mapOpenCodeMessage({
      info: { id: "init-inquiry", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [
        { id: "text", sessionID: "session", messageID: "init-inquiry", type: "text", text: "/init 这个技能是干嘛的" }
      ]
    } as never)).toMatchObject({
      text: "/init 这个技能是干嘛的",
      slashCommand: "init",
      slashArguments: "这个技能是干嘛的"
    });
  });

  it("技能消息忽略 text 分片里的 prompt 模板，只展示命令胶囊", () => {
    const initTemplate = "Create or update `AGENTS.md` for this repository.\n\n## How to investigate\n- README*";
    expect(mapOpenCodeMessage({
      info: { id: "init-user", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [
        { id: "text", sessionID: "session", messageID: "init-user", type: "text", text: initTemplate },
        {
          id: "subtask", sessionID: "session", messageID: "init-user", type: "subtask",
          prompt: initTemplate,
          description: "guided AGENTS.md setup",
          agent: "build",
          command: "init"
        }
      ]
    } as never)).toMatchObject({
      text: "/init",
      slashCommand: "init",
      slashDetail: "guided AGENTS.md setup"
    });
  });

  it("用户斜杠命令保留简短参数", () => {
    expect(mapOpenCodeMessage({
      info: { id: "slash-args", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [{
        id: "subtask", sessionID: "session", messageID: "slash-args", type: "subtask",
        prompt: "keep",
        description: "compact session",
        agent: "build",
        command: "compact"
      }]
    } as never)).toMatchObject({
      text: "/compact keep",
      slashArguments: "keep"
    });
  });

  it("技能命令保留 text 分片里的用户附加说明", () => {
    expect(mapOpenCodeMessage({
      info: { id: "init-args", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [
        { id: "text", sessionID: "session", messageID: "init-args", type: "text", text: "/init 这个技能是干嘛的" },
        {
          id: "subtask", sessionID: "session", messageID: "init-args", type: "subtask",
          prompt: "Create or update `AGENTS.md` for this repository.",
          description: "guided AGENTS.md setup",
          agent: "build",
          command: "init"
        }
      ]
    } as never)).toMatchObject({
      text: "/init 这个技能是干嘛的",
      slashCommand: "init",
      slashArguments: "这个技能是干嘛的"
    });
  });

  it("超过 160 字的普通用户文字消息仍完整展示", () => {
    const longText = "This version of the \"Kimi Code 仪表盘\" extension was published by 1998moye. "
      + "That user account is not a verified publisher of the namespace \"Dingzhen\" of this extension. "
      + "See the documentation to learn how we handle namespaces and what you can do to eliminate this warning.";
    expect(mapOpenCodeMessage({
      info: { id: "long-user", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [{ id: "text", sessionID: "session", messageID: "long-user", type: "text", text: longText }]
    } as never)).toMatchObject({
      id: "long-user",
      role: "user",
      text: longText
    });
  });

  it("subtask 消息从技能信封 text 分片提取用户附加说明", () => {
    const envelope = [
      "Run a `/grilling` session.",
      "",
      "Base directory for this skill: D:\\demo\\.agents\\skills\\grill-me",
      "",
      "D:\\demo\\d3_练习.ts 这个练习代码有问题吗"
    ].join("\n");
    expect(mapOpenCodeMessage({
      info: { id: "grill-user", sessionID: "session", role: "user", time: { created: 1 } },
      parts: [
        { id: "text", sessionID: "session", messageID: "grill-user", type: "text", text: envelope },
        {
          id: "subtask", sessionID: "session", messageID: "grill-user", type: "subtask",
          prompt: envelope,
          description: "grill-me",
          agent: "grill-me",
          command: "grill-me"
        }
      ]
    } as never)).toMatchObject({
      text: "/grill-me D:\\demo\\d3_练习.ts 这个练习代码有问题吗",
      slashCommand: "grill-me",
      slashArguments: "D:\\demo\\d3_练习.ts 这个练习代码有问题吗"
    });
  });

  it("grill-me 运行时信封不会生成用户气泡", () => {
    const envelope = [
      "Run a `/grilling` session.",
      "",
      "Base directory for this skill: D:\\projects\\agent_study\\.agents\\skills\\grill-me",
      "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
      "",
      "D:\\projects\\agent_study\\projects\\01-api-tool\\d3_练习.ts 这个练习代码有问题吗"
    ].join("\n");
    expect(mapOpenCodeMessage({
      info: { id: "grill-envelope", sessionID: "session", role: "user", time: { created: 2 } },
      parts: [{ id: "text", sessionID: "session", messageID: "grill-envelope", type: "text", text: envelope }]
    } as never)).toBeUndefined();
  });

  it("技能 prompt 单独落盘的用户消息不会生成气泡", () => {
    const template = "Two-axis review of the diff between `HEAD` and a fixed point the user supplies:\n\n## Process\n\n### 1. Pin the fixed point";
    expect(mapOpenCodeMessage({
      info: { id: "skill-text", sessionID: "session", role: "user", time: { created: 2 } },
      parts: [{ id: "text", sessionID: "session", messageID: "skill-text", type: "text", text: template }]
    } as never)).toBeUndefined();
  });
});
