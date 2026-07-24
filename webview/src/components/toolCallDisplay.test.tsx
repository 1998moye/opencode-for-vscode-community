import { describe, expect, it } from "vitest";
import { parseToolCallDisplay, parseUserMessageDisplay } from "./toolCallDisplay";

describe("parseToolCallDisplay", () => {
  it("turns a Read tool call into a compact file card", () => {
    expect(parseToolCallDisplay(`Called the Read tool with the following input:\n{"filePath":"d:\\projects\\demo\\d2_练习.ts"}\n你好，看下这个代码有没有问题`)).toEqual({
      toolName: "Read",
      filePath: "d:\\projects\\demo\\d2_练习.ts",
      fileName: "d2_练习.ts",
      remainingText: "你好，看下这个代码有没有问题"
    });
  });

  it("extracts the file path even when Windows backslashes make the JSON invalid", () => {
    expect(parseToolCallDisplay(`Called the Read tool with the following input:\n{"filePath":"d:\\projects\\demo\\d2_练习.ts"}\n检查一下`)).toMatchObject({
      toolName: "Read",
      fileName: "d2_练习.ts",
      remainingText: "检查一下"
    });
  });

  it("leaves ordinary message text alone", () => {
    expect(parseToolCallDisplay("正常回复")).toBeUndefined();
  });
});

describe("parseUserMessageDisplay", () => {
  it("归一斜杠命令为命令胶囊，不保留裸文本", () => {
    expect(parseUserMessageDisplay("/init")).toEqual({
      slashCommand: "init",
      remainingText: ""
    });
  });

  it("斜杠命令保留参数摘要", () => {
    expect(parseUserMessageDisplay("/build 并优化这段代码")).toEqual({
      slashCommand: "build",
      arguments: "并优化这段代码",
      remainingText: ""
    });
  });

  it("归一 Shell 命令为胶囊", () => {
    expect(parseUserMessageDisplay("!git status")).toEqual({
      shellCommand: "git status",
      remainingText: ""
    });
  });

  it("把多个文件附件前缀都抽成附件卡片", () => {
    const result = parseUserMessageDisplay(
      `Called the Read tool with the following input:\n{"filePath":"d:/pro/a.ts"}\nCalled the Read tool with the following input:\n{"filePath":"d:/pro/b.ts"}\n再看一下`
    );
    expect(result.attachments).toEqual([
      { filePath: "d:/pro/a.ts", fileName: "a.ts" },
      { filePath: "d:/pro/b.ts", fileName: "b.ts" }
    ]);
    expect(result.remainingText).toBe("再看一下");
  });

  it("普通提示文本不产生命令或附件", () => {
    expect(parseUserMessageDisplay("帮我看看这段代码")).toEqual({
      remainingText: "帮我看看这段代码"
    });
  });
});
