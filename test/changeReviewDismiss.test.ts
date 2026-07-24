import { describe, expect, it } from "vitest";
import type { ChangeLedgerEntry } from "../src/runtime/contracts.js";
import {
  anchorFromLedgerEntry,
  isEntryDismissedByAnchors,
  shouldHideDismissedEntry
} from "../src/runtime/changeReview/changeReviewDismiss.js";

describe("changeReviewDismiss", () => {
  const base: ChangeLedgerEntry = {
    filePath: "D:/demo/a.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    revertibility: "full",
    messageId: "msg-1",
    agentAfter: "v1"
  };

  it("同路径新 messageId 不应再被旧锚点隐藏", () => {
    const anchor = anchorFromLedgerEntry(base);
    const nextTurn: ChangeLedgerEntry = { ...base, messageId: "msg-2", agentAfter: "v2" };
    expect(shouldHideDismissedEntry(nextTurn, anchor)).toBe(false);
    expect(isEntryDismissedByAnchors(nextTurn, [anchor])).toBe(false);
  });

  it("同快照仍应隐藏", () => {
    const anchor = anchorFromLedgerEntry(base);
    expect(isEntryDismissedByAnchors({ ...base }, [anchor])).toBe(true);
  });
});
