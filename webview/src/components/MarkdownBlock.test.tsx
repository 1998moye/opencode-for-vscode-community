// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownBlock } from "./MarkdownBlock";

describe("MarkdownBlock", () => {
  it("renders fenced code blocks from assistant markdown", async () => {
    const markdown = "运行方式：\n\n```bash\ncd projects/01-api-tool\npip install openai\n```";
    const { container } = render(<MarkdownBlock text={markdown} />);
    await waitFor(() => {
      expect(container.querySelector(".message__code-block")).toBeTruthy();
    });
    expect(container.querySelector(".message__markdown")?.textContent).toContain("cd projects/01-api-tool");
    expect(container.textContent).not.toContain("```");
  });
});
