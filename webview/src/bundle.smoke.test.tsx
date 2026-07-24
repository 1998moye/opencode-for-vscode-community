// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

describe("production webview bundle", () => {
  it("loads and mounts the app shell", async () => {
    (globalThis as { acquireVsCodeApi?: () => { postMessage: () => void } }).acquireVsCodeApi = () => ({
      postMessage: () => undefined
    });
    document.body.innerHTML = `<div id="root"></div>`;
    await import("../../dist/webview/assets/app.js");
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const root = document.getElementById("root");
    expect(root?.childElementCount).toBeGreaterThan(0);
    expect(root?.querySelector(".app-shell, .webview-error")).toBeTruthy();
  });
});
