import { describe, expect, it } from "vitest";
import { enrichChangeLedgerEntryStats } from "../src/backend/gateway/sessionChangeLedgerStats.js";
import type { ChangeLedgerEntry } from "../src/runtime/contracts.js";

function entry(partial: Partial<ChangeLedgerEntry> & Pick<ChangeLedgerEntry, "filePath" | "status">): ChangeLedgerEntry {
  return {
    additions: 0,
    deletions: 0,
    revertibility: "readonly",
    ...partial
  };
}

describe("enrichChangeLedgerEntryStats", () => {
  it("保留 Server 已提供的统计", () => {
    const result = enrichChangeLedgerEntryStats(entry({
      filePath: "a.ts",
      status: "modified",
      additions: 3,
      deletions: 1
    }));
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(1);
  });

  it("新建文件按行数推算 additions", () => {
    const result = enrichChangeLedgerEntryStats(entry({
      filePath: "b.ts",
      status: "added",
      agentAfter: "line1\nline2\n",
      revertibility: "full"
    }));
    expect(result).toMatchObject({ additions: 2, deletions: 0 });
  });

  it("删除文件按行数推算 deletions", () => {
    const result = enrichChangeLedgerEntryStats(entry({
      filePath: "c.py",
      status: "deleted",
      agentBefore: "a\nb\nc",
      revertibility: "full"
    }));
    expect(result).toMatchObject({ additions: 0, deletions: 3 });
  });

  it("从 patch 解析 +/−", () => {
    const result = enrichChangeLedgerEntryStats(entry({
      filePath: "d.ts",
      status: "modified",
      patch: "@@\n-old\n+new\n context",
      revertibility: "readonly"
    }));
    expect(result).toMatchObject({ additions: 1, deletions: 1 });
  });
});
