import { describe, expect, it } from "vitest";
import { classifyComposerSubmit, isSlashCommandInquiry } from "../src/runtime/composer/classifyComposerSubmit.js";

describe("classifyComposerSubmit", () => {
  it("识别普通提示", () => {
    expect(classifyComposerSubmit("  hello world  ")).toEqual({
      kind: "prompt",
      text: "hello world"
    });
  });

  it("识别斜杠命令与参数", () => {
    expect(classifyComposerSubmit("/compact keep history")).toEqual({
      kind: "slash-command",
      command: "compact",
      arguments: "keep history",
      raw: "/compact keep history"
    });
  });

  it("识别无参数斜杠命令", () => {
    expect(classifyComposerSubmit("/help")).toEqual({
      kind: "slash-command",
      command: "help",
      arguments: "",
      raw: "/help"
    });
  });

  it("识别 Shell 命令", () => {
    expect(classifyComposerSubmit("! ls -la")).toEqual({
      kind: "shell",
      command: "ls -la",
      raw: "! ls -la"
    });
  });

  it("不以感叹号开头时保持普通提示", () => {
    expect(classifyComposerSubmit("run !danger")).toEqual({
      kind: "prompt",
      text: "run !danger"
    });
  });

  it("询问技能用途时按普通对话发送，不触发执行", () => {
    expect(classifyComposerSubmit("/init 这个技能是干嘛的")).toEqual({
      kind: "prompt",
      text: "/init 这个技能是干嘛的"
    });
  });
});

describe("isSlashCommandInquiry", () => {
  it("识别中文技能用途询问", () => {
    expect(isSlashCommandInquiry("这个技能是干嘛的")).toBe(true);
    expect(isSlashCommandInquiry("介绍一下这个命令")).toBe(true);
  });

  it("执行型参数不算询问", () => {
    expect(isSlashCommandInquiry("keep history")).toBe(false);
    expect(isSlashCommandInquiry("并优化这段代码")).toBe(false);
  });
});
