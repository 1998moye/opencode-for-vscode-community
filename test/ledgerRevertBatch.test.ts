import { describe, expect, it } from "vitest";
import { filterLedgerEntriesByMessageIds } from "../src/runtime/changeReview/sessionMessageRevert.js";
import type { ChangeLedgerEntry } from "../src/runtime/contracts.js";

describe("filterLedgerEntriesByMessageIds", () => {
  it("按 messageId 过滤账本项", () => {
    const entries: ChangeLedgerEntry[] = [
      { filePath: "/a", status: "modified", additions: 1, deletions: 0, revertibility: "full", messageId: "m1" },
      { filePath: "/b", status: "modified", additions: 1, deletions: 0, revertibility: "full", messageId: "m2" }
    ];
    expect(filterLedgerEntriesByMessageIds(entries, ["m1", "m3"]).map((e) => e.filePath)).toEqual(["/a"]);
  });
});
