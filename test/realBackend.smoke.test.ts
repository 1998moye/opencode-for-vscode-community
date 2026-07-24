import { describe, expect, it } from "vitest";
import { NodeOpenCodeBackend } from "../src/backend/nodeOpenCodeBackend.js";

describe("真实 OpenCode 后端冒烟", () => {
  it.runIf(process.env.OPENCODE_REAL_BACKEND_SMOKE === "1")(
    "可以启动受管 Server、读取会话并正常关闭",
    async () => {
      const backend = new NodeOpenCodeBackend({
        executable: "opencode",
        mode: "managed",
        externalUrl: "",
        externalUsername: "opencode",
        externalPassword: "",
        log: () => undefined
      });
      const health = await backend.inspectCli();
      expect(health.status).toBe("compatible");

      const connection = await backend.connect(process.cwd());
      try {
        expect(connection.ownership).toBe("managed");
        expect(connection.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
        expect(await connection.listSessions()).toBeInstanceOf(Array);
      } finally {
        await connection.dispose();
      }
    },
    20_000
  );
});
