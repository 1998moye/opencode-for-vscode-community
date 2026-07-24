// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayloadBody } from "./PayloadBody";

describe("PayloadBody", () => {
  it("renders syntax-highlighted code for Write tool input", async () => {
    const body = "D:/demo/current-time.ts\n\nconst now = new Date();\n";
    const { container } = render(<PayloadBody body={body} toolLabel="write" variant="input" />);
    expect(container.querySelector(".message__payload-path")?.textContent).toContain("current-time.ts");
    await waitFor(() => {
      expect(container.querySelector(".message__code-block .hljs-keyword")).toBeTruthy();
    });
  });

  it("renders highlighted bash command for shell input", async () => {
    const { container } = render(
      <PayloadBody body="bun run current-time.ts" toolLabel="bash" variant="input" />
    );
    await waitFor(() => {
      expect(container.querySelector(".message__code-block .hljs")).toBeTruthy();
    });
  });

  it("renders todo checklist instead of raw JSON", () => {
    const body = "[ ] 删除文件\n[~] 重写文件";
    const { container } = render(<PayloadBody body={body} toolLabel="todowrite" variant="input" />);
    expect(container.querySelectorAll(".message__todo-item")).toHaveLength(2);
    expect(container.textContent).not.toContain('"content"');
  });

  it("renders read output path as a single clickable button", () => {
    const body = "D:/demo/config.ts\n\nexport const x = 1;\n";
    const { container } = render(<PayloadBody body={body} toolLabel="read" variant="output" />);
    expect(container.querySelectorAll("button.message__payload-path")).toHaveLength(1);
    expect(container.querySelector("button.message__payload-path")?.textContent).toContain("config.ts");
  });

  it("renders read markdown output as parsed markdown", async () => {
    const body = "D:/demo/变更记录.md\n\n1: # 变更记录\n2:\n3: - 条目";
    const { container } = render(<PayloadBody body={body} toolLabel="read" variant="output" />);
    await waitFor(() => {
      expect(container.querySelector(".message__markdown h1")?.textContent).toContain("变更记录");
    });
    expect(container.querySelector(".message__code-block")).toBeNull();
  });

  it("renders read directory output as entry list", () => {
    const body = `<path>D:/demo/01-api-tool</path>\n<type>directory</type>\n<entries>\n.env\nREADME.md\nsrc/\n(3 entries)\n</entries>`;
    const { container } = render(<PayloadBody body={body} toolLabel="read" variant="output" />);
    expect(container.querySelector(".message__dir-list-header")?.textContent).toBe("3 项");
    expect(container.querySelectorAll(".message__dir-entry--file")).toHaveLength(2);
    expect(container.querySelector(".message__dir-entry--folder")?.textContent).toBe("src/");
  });

  it("renders glob output paths as clickable buttons without count prefix", () => {
    const body = "1 条结果 D:/demo/01-api-tool/.env";
    const { container } = render(<PayloadBody body={body} toolLabel="glob" variant="output" />);
    const pathButton = container.querySelector("button.message__payload-path");
    expect(pathButton?.textContent).toBe("D:/demo/01-api-tool/.env");
    expect(container.textContent).toContain("1 条结果");
    expect(pathButton?.textContent).not.toContain("条结果");
  });

  it("highlights edit diff lines with add/remove backgrounds", async () => {
    const body = "编辑 D:/demo/app.ts\n\n--- 旧 ---\nconst a = 1;\n\n--- 新 ---\nconst a = 2;\n";
    const { container } = render(<PayloadBody body={body} toolLabel="edit" variant="input" />);
    expect(container.querySelector(".message__diff-line--remove")).toBeTruthy();
    expect(container.querySelector(".message__diff-line--add")).toBeTruthy();
  });
});
