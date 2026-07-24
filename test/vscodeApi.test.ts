import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("postToHost", () => {
  it("does not prevent the webview from mounting when the VS Code API is temporarily unavailable", async () => {
    const previous = (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
    delete (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;

    try {
      const api = await import("../webview/src/vscodeApi.js");
      expect(() => api.postToHost({ type: "surface-ready" })).not.toThrow();
    } finally {
      if (previous !== undefined) {
        (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = previous;
      }
    }
  });
});
