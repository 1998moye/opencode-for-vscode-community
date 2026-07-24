import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "webview/src/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/runtime/**/*.ts"]
    }
  }
});
