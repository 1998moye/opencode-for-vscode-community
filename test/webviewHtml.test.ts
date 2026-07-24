import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  Uri: {
    joinPath: (...parts: string[]) => parts.join("/")
  }
}));

import { createWebviewHtml } from "../src/surfaces/webviewHtml.js";

describe("createWebviewHtml", () => {
  it("emits a complete document that can mount the webview application", () => {
    const html = createWebviewHtml({
      cspSource: "vscode-webview://test",
      asWebviewUri: (uri: string) => `webview:${uri}`
    } as never, "extension" as never);

    expect(html).toContain("</title>");
    expect(html).toContain('<div id="root">');
    expect(html).toContain("OpenCode 正在加载");
    expect(html).toContain('type="module"');
    expect(html).toContain('src="webview:extension/dist/webview/assets/app.js"');
  });
});
