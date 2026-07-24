import { describe, expect, it, vi } from "vitest";
import type { ChangeLedgerEntry } from "../src/runtime/contracts.js";
import { assessSessionMessageRevertTarget } from "../src/runtime/changeReview/sessionMessageRevert.js";

describe("assessSessionMessageRevertTarget", () => {
  it("全部可回退且磁盘等于 Agent 修改后时返回共用 messageId", async () => {
    const entries: ChangeLedgerEntry[] = [
      {
        filePath: "/p/a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        messageId: "msg-1",
        agentBefore: "a\n",
        agentAfter: "b\n"
      },
      {
        filePath: "/p/b.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        messageId: "msg-1",
        agentBefore: "x\n",
        agentAfter: "y\n"
      }
    ];
    const id = await assessSessionMessageRevertTarget(entries, async (filePath) => {
      if (filePath.endsWith("a.ts")) {
        return { exists: true, content: "b\n" };
      }
      return { exists: true, content: "y\n" };
    });
    expect(id).toBe("msg-1");
  });

  it("messageId 不一致或存在冲突时返回 undefined", async () => {
    const entries: ChangeLedgerEntry[] = [
      {
        filePath: "/p/a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        messageId: "msg-1",
        agentBefore: "a\n",
        agentAfter: "b\n"
      },
      {
        filePath: "/p/b.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        messageId: "msg-2",
        agentBefore: "x\n",
        agentAfter: "y\n"
      }
    ];
    expect(await assessSessionMessageRevertTarget(entries, vi.fn())).toBeUndefined();
  });

  it("磁盘与 Agent 修改后不一致时返回 undefined", async () => {
    const entries: ChangeLedgerEntry[] = [
      {
        filePath: "/p/a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        messageId: "msg-1",
        agentBefore: "a\n",
        agentAfter: "b\n"
      }
    ];
    const id = await assessSessionMessageRevertTarget(entries, async () => ({ exists: true, content: "c\n" }));
    expect(id).toBeUndefined();
  });
});
