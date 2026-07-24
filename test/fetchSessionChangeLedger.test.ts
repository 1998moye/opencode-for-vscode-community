import { describe, expect, it, vi } from "vitest";
import { fetchSessionChangeLedger } from "../src/backend/gateway/fetchSessionChangeLedger.js";
import type { SessionSummary } from "../src/runtime/contracts.js";

const session: SessionSummary = {
  id: "sess-1",
  title: "t",
  directory: "D:\\projects\\agent_study\\projects\\01-api-tool",
  updatedAt: 1
};

describe("fetchSessionChangeLedger", () => {
  it("合并 session.diff 与 Write 工具分片", async () => {
    const client = {
      session: {
        diff: vi.fn().mockResolvedValue({
          data: [
            {
              file: "/proj/foo.ts",
              status: "modified",
              additions: 2,
              deletions: 1,
              patch: "@@"
            }
          ]
        }),
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: { id: "msg-1" },
              parts: [
                {
                  type: "tool",
                  tool: "write",
                  state: {
                    status: "completed",
                    input: { file_path: "/proj/bar.ts", content: "hello" }
                  }
                }
              ]
            }
          ]
        })
      }
    };
    const entries = await fetchSessionChangeLedger(client as never, session);
    expect(entries).toHaveLength(2);
    const bar = entries.find((entry) => entry.filePath.endsWith("bar.ts"));
    expect(bar?.revertibility).toBe("full");
    expect(bar?.agentAfter).toBe("hello");
    expect(bar?.agentBefore).toBe("");
    expect(bar?.additions).toBe(1);
    expect(bar?.deletions).toBe(0);
  });

  it("shell 删除 + Read 记录时 agentBefore 为 content 正文", async () => {
    const readOutput = [
      "<path>D:\\\\projects\\\\agent_study\\\\projects\\\\01-api-tool\\\\current_time.ts</path>",
      "<type>file</type>",
      "<content>",
      "1: export function main() {}",
      "(End of file - total 1 lines)",
      "</content>"
    ].join("\n");
    const client = {
      session: {
        diff: vi.fn().mockResolvedValue({ data: [] }),
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: { id: "msg-read" },
              parts: [
                {
                  type: "tool",
                  tool: "read",
                  state: {
                    status: "completed",
                    input: { file_path: "D:\\projects\\agent_study\\projects\\01-api-tool\\current_time.ts" },
                    output: readOutput
                  }
                }
              ]
            },
            {
              info: { id: "msg-rm" },
              parts: [
                {
                  type: "tool",
                  tool: "powershell",
                  state: {
                    status: "completed",
                    input: {
                      command: 'Remove-Item -LiteralPath "D:\\projects\\agent_study\\projects\\01-api-tool\\current_time.ts"'
                    }
                  }
                }
              ]
            }
          ]
        })
      }
    };
    const entries = await fetchSessionChangeLedger(client as never, session);
    const deleted = entries.find((e) => e.filePath.toLowerCase().includes("current_time.ts"));
    expect(deleted?.status).toBe("deleted");
    expect(deleted?.agentBefore).toBe("export function main() {}");
    expect(deleted?.revertibility).toBe("full");
  });

  it("session.diff 的 before 含 Read XML 时不被后续空 shell 分片覆盖", async () => {
    const xmlBefore = [
      "<path>D:\\\\proj\\\\current_time.py</path>",
      "<type>file</type>",
      "<content>",
      "1: print('hi')",
      "</content>"
    ].join("\n");
    const client = {
      session: {
        diff: vi.fn().mockResolvedValue({
          data: [
            {
              file: "D:\\proj\\current_time.py",
              status: "deleted",
              additions: 0,
              deletions: 1,
              before: xmlBefore,
              after: ""
            }
          ]
        }),
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: { id: "msg-rm" },
              parts: [
                {
                  type: "tool",
                  tool: "bash",
                  state: {
                    status: "completed",
                    input: { command: "rm D:\\proj\\current_time.py" }
                  }
                }
              ]
            }
          ]
        })
      }
    };
    const localSession = { ...session, directory: "D:\\proj" };
    const entries = await fetchSessionChangeLedger(client as never, localSession);
    const deleted = entries.find((e) => e.filePath.includes("current_time.py"));
    expect(deleted?.agentBefore).toBe("print('hi')");
    expect(deleted?.revertibility).toBe("full");
  });
});
