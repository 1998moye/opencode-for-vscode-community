import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: { showInformationMessage: vi.fn() },
  workspace: { openTextDocument: vi.fn(async () => ({})) },
  commands: { executeCommand: vi.fn(async () => undefined) },
  Uri: { parse: (value: string) => ({ toString: () => value }) }
}));

import type { ChangeLedgerEntry } from "../src/runtime/contracts.js";
import { revertAllChangeFilesOnDisk, revertChangeFileOnDisk } from "../src/extension/changeReviewActions.js";

describe("changeReviewActions", () => {
  it("冲突时返回 conflict 且不写盘", async () => {
    const entry: ChangeLedgerEntry = {
      filePath: "/p/a.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      revertibility: "full",
      agentBefore: "a\n",
      agentAfter: "b\n"
    };
    const outcome = await revertChangeFileOnDisk(
      entry,
      async () => ({ exists: true, content: "c\n" }),
      vi.fn(),
      vi.fn()
    );
    expect(outcome).toEqual({
      status: "conflict",
      reason: "文件在 Agent 完成后已被修改，无法自动回退。请在三方对比中手动处理。"
    });
  });

  it("Agent 删除的文件在磁盘不存在时应写回 agentBefore", async () => {
    const writeText = vi.fn();
    const entry: ChangeLedgerEntry = {
      filePath: "/p/deleted.ts",
      status: "deleted",
      additions: 0,
      deletions: 1,
      revertibility: "full",
      agentBefore: "restore me\n",
      agentAfter: ""
    };
    const outcome = await revertChangeFileOnDisk(
      entry,
      async () => ({ exists: false, content: "" }),
      writeText,
      vi.fn()
    );
    expect(outcome).toEqual({ status: "reverted" });
    expect(writeText).toHaveBeenCalledWith("/p/deleted.ts", "restore me");
  });

  it("批量回退统计成功与冲突", async () => {
    const entries: ChangeLedgerEntry[] = [
      {
        filePath: "/p/ok.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        agentBefore: "a\n",
        agentAfter: "b\n"
      },
      {
        filePath: "/p/conflict.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        agentBefore: "a\n",
        agentAfter: "b\n"
      },
      {
        filePath: "/p/readonly.ts",
        status: "modified",
        additions: 0,
        deletions: 0,
        revertibility: "readonly"
      }
    ];
    const result = await revertAllChangeFilesOnDisk(
      entries,
      async (filePath) => {
        if (filePath.endsWith("ok.ts")) {
          return { exists: true, content: "b\n" };
        }
        return { exists: true, content: "c\n" };
      },
      vi.fn(),
      vi.fn()
    );
    expect(result.reverted).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.skippedReadonly).toBe(1);
  });
});
