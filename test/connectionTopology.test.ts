import { describe, expect, it } from "vitest";
import {
  evaluatePathCapabilities,
  validateExternalServerUrl
} from "../src/backend/topology/connectionTopology.js";

describe("外部服务连接拓扑", () => {
  it("允许回环 HTTP 与非回环 HTTPS", () => {
    expect(validateExternalServerUrl("http://127.0.0.1:4096")).toBe("http://127.0.0.1:4096");
    expect(validateExternalServerUrl("https://opencode.example.com")).toBe("https://opencode.example.com");
  });

  it("拒绝非回环地址上的明文 HTTP", () => {
    expect(() => validateExternalServerUrl("http://192.168.1.20:4096")).toThrow(
      "非回环 OpenCode Server 必须使用 HTTPS"
    );
  });

  it("远程服务缺少路径映射时只开放聊天和历史", () => {
    const result = evaluatePathCapabilities({
      topology: "external-remote",
      localDirectory: "D:\\projects\\demo",
      serverDirectory: "/srv/demo",
      mappings: []
    });

    expect(result.capabilities.chat.enabled).toBe(true);
    expect(result.capabilities.history.enabled).toBe(true);
    expect(result.capabilities.fileContext).toEqual({
      enabled: false,
      reason: "远程服务没有覆盖当前会话目录的已验证路径映射。"
    });
    expect(result.serverDirectory).toBeUndefined();
  });

  it("把 Windows 本地目录稳定映射到 Linux Server 目录但保持写入能力禁用", () => {
    const result = evaluatePathCapabilities({
      topology: "external-remote",
      localDirectory: "D:\\work\\demo\\src",
      serverDirectory: "/srv/demo/src",
      mappings: [{ localRoot: "D:\\work\\demo", serverRoot: "/srv/demo" }]
    });

    expect(result.serverDirectory).toBe("/srv/demo/src");
    expect(result.capabilities.chat.enabled).toBe(true);
    expect(result.capabilities.review).toEqual({
      enabled: false,
      reason: "路径映射尚未通过读写探测，文件能力保持禁用。"
    });
  });

  it("同文件系统声明只有在规范化目录一致时开放本地能力", () => {
    const valid = evaluatePathCapabilities({
      topology: "external-same-filesystem",
      localDirectory: "D:\\Work\\demo",
      serverDirectory: "d:\\work\\demo\\",
      mappings: []
    });
    const invalid = evaluatePathCapabilities({
      topology: "external-same-filesystem",
      localDirectory: "D:\\work\\demo",
      serverDirectory: "D:\\other",
      mappings: []
    });

    expect(valid.capabilities.review.enabled).toBe(true);
    expect(invalid.capabilities.review.enabled).toBe(false);
  });
});
