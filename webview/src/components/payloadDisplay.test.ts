import { describe, expect, it } from "vitest";
import { highlightCodeHtml, languageFromPath, parseToolPayloadSegments } from "./payloadDisplay";

describe("languageFromPath", () => {
  it("maps TypeScript extensions", () => {
    expect(languageFromPath("D:/demo/current-time.ts")).toBe("typescript");
    expect(languageFromPath("app.tsx")).toBe("typescript");
  });
});

describe("parseToolPayloadSegments", () => {
  it("splits Write input into path and highlighted code", () => {
    const body = "D:/demo/current-time.ts\n\nconst now = new Date();\n";
    expect(parseToolPayloadSegments("write", body, "input")).toEqual([
      { kind: "path", text: "D:/demo/current-time.ts" },
      { kind: "code", text: "const now = new Date();", language: "typescript", diffAll: "add" }
    ]);
  });

  it("keeps Write markdown input as syntax-highlighted code", () => {
    const body = "D:/demo/变更记录.md\n\n# Title\n\nHello";
    expect(parseToolPayloadSegments("write", body, "input")).toEqual([
      { kind: "path", text: "D:/demo/变更记录.md" },
      { kind: "code", text: "# Title\n\nHello", language: "markdown", diffAll: "add" }
    ]);
  });

  it("highlights Bash command input", () => {
    expect(parseToolPayloadSegments("bash", "bun run current-time.ts", "input")).toEqual([
      { kind: "code", text: "bun run current-time.ts", language: "bash" }
    ]);
  });

  it("parses Bash output metadata and stdout", () => {
    const body = "command: bun run current-time.ts\nworkdir: D:/demo\n\n2026-07-23";
    expect(parseToolPayloadSegments("bash", body, "output")).toEqual([
      { kind: "meta", key: "command", value: "bun run current-time.ts", highlight: true },
      { kind: "meta", key: "workdir", value: "D:/demo", highlight: false },
      { kind: "text", text: "2026-07-23" }
    ]);
  });

  it("parses Edit sections into diff segment", () => {
    const body = "编辑 D:/demo/app.ts\n\n--- 旧 ---\nconst a = 1;\n\n--- 新 ---\nconst a = 2;\n";
    expect(parseToolPayloadSegments("edit", body, "input")).toEqual([
      { kind: "path", text: "D:/demo/app.ts" },
      { kind: "edit-diff", oldText: "const a = 1;", newText: "const a = 2;", language: "typescript" }
    ]);
  });

  it("parses Edit header path even without trailing blank line", () => {
    const body = "编辑 D:/demo/变更记录.md";
    expect(parseToolPayloadSegments("edit", body, "input")).toEqual([
      { kind: "path", text: "D:/demo/变更记录.md" }
    ]);
  });

  it("renders Edit new section on md files as highlighted code, not rendered markdown", () => {
    const body = "编辑 D:/demo/README.md\n\n--- 新 ---\n# Title\n\nHello";
    expect(parseToolPayloadSegments("edit", body, "input")).toEqual([
      { kind: "path", text: "D:/demo/README.md" },
      { kind: "code", text: "# Title\n\nHello", language: "markdown", diffAll: "add" }
    ]);
  });

  it("parses Read XML output into path and highlighted code", () => {
    const body = "<path>D:/demo/ask.ts</path>\n<type>file</type>\n<content>\n     1|const x = 1;\n</content>";
    expect(parseToolPayloadSegments("read", body, "output")).toEqual([
      { kind: "path", text: "D:/demo/ask.ts" },
      { kind: "code", text: "const x = 1;", language: "typescript" }
    ]);
  });

  it("parses TodoWrite JSON into checklist items", () => {
    const body = `todos: [3 项]\n[{"content":"删除文件","status":"pending","priority":"high"}]`;
    expect(parseToolPayloadSegments("todowrite", body, "input")).toEqual([
      {
        kind: "todos",
        items: [{ content: "删除文件", status: "pending", priority: "high" }]
      }
    ]);
  });

  it("parses Read directory XML into clickable entry list", () => {
    const body = `<path>D:/demo/01-api-tool</path>\n<type>directory</type>\n<entries>\n.env\nREADME.md\nsrc/\n(3 entries)\n</entries>`;
    expect(parseToolPayloadSegments("read", body, "output")).toEqual([
      { kind: "path", text: "D:/demo/01-api-tool" },
      { kind: "dir-list", basePath: "D:/demo/01-api-tool", entries: [".env", "README.md", "src/"] }
    ]);
  });

  it("parses Glob output into count summary and clickable paths", () => {
    const body = "1 条结果\nD:/demo/01-api-tool/.env";
    expect(parseToolPayloadSegments("glob", body, "output")).toEqual([
      { kind: "text", text: "1 条结果" },
      { kind: "path", text: "D:/demo/01-api-tool/.env" }
    ]);
  });

  it("parses Glob output when count and path share one line", () => {
    const body = "1 条结果 D:/demo/01-api-tool/.env";
    expect(parseToolPayloadSegments("glob", body, "output")).toEqual([
      { kind: "text", text: "1 条结果" },
      { kind: "path", text: "D:/demo/01-api-tool/.env" }
    ]);
  });

  it("does not treat multiline read body with trailing extension as one path", () => {
    const body = "1 条结果\nD:/demo/config.ts";
    expect(parseToolPayloadSegments("read", body, "output")).toEqual([]);
  });

  it("parses markdown file content for Read output", () => {
    const body = "D:/demo/README.md\n\n# Title\n\nHello";
    expect(parseToolPayloadSegments("read", body, "output")).toEqual([
      { kind: "path", text: "D:/demo/README.md" },
      { kind: "markdown", text: "# Title\n\nHello" }
    ]);
  });

  it("strips colon line numbers before rendering Read markdown", () => {
    const body = "D:/demo/变更记录.md\n\n1: # Title\n2:\n3: Hello";
    expect(parseToolPayloadSegments("read", body, "output")).toEqual([
      { kind: "path", text: "D:/demo/变更记录.md" },
      { kind: "markdown", text: "# Title\n\nHello" }
    ]);
  });
});

describe("highlightCodeHtml", () => {
  it("wraps keywords in span tags", async () => {
    const html = await highlightCodeHtml("const value = 1;", "typescript");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("const");
  });
});
