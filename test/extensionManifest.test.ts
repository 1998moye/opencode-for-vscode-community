import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("扩展清单", () => {
  it("右侧栏容器使用 VS Code 接受的标识，并且聊天视图注册到该容器", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8"));
    const container = manifest.contributes.viewsContainers.secondarySidebar[0];

    expect(container.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(manifest.contributes.views[container.id]).toEqual([
      expect.objectContaining({ id: "opencodeCommunity.chatView", type: "webview" })
    ]);
  });
});
