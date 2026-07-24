import { describe, expect, it, vi } from "vitest";
import { ChangeReviewModule } from "../src/runtime/changeReview/changeReviewModule.js";
import { OpenCodeStateStore } from "../src/runtime/state/openCodeStateStore.js";
import type { OpenCodeConnection, SessionSummary } from "../src/runtime/contracts.js";

const session: SessionSummary = {
  id: "sess-1",
  title: "t",
  directory: "D:\\demo",
  updatedAt: 1
};

describe("ChangeReviewModule", () => {
  it("刷新完成后仍过滤用户已保留的同快照项", async () => {
    const state = new OpenCodeStateStore("zh-cn", true);
    state.update({
      activeSessionId: "sess-1",
      sessions: [session],
      changeReview: {
        status: "ready",
        entries: [{
          filePath: "D:\\demo\\a.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          revertibility: "full",
          messageId: "m1",
          agentAfter: "x"
        }],
        dismissedAnchors: [{
          filePath: "D:\\demo\\a.ts",
          status: "modified",
          messageId: "m1",
          agentAfter: "x"
        }]
      }
    });
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const connection = {
      capabilities: { review: { enabled: true } },
      listSessionChangeLedger: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockImplementationOnce(() => fetchPromise)
    } as unknown as OpenCodeConnection;
    const module = new ChangeReviewModule(state, () => connection);

    await module.refresh("sess-1");
    const refreshPromise = module.refresh("sess-1");
    state.current.changeReview && module.dismissEntry("D:\\demo\\b.ts");
    resolveFetch([
      {
        filePath: "D:\\demo\\a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        revertibility: "full",
        messageId: "m1",
        agentAfter: "x"
      },
      {
        filePath: "D:\\demo\\b.ts",
        status: "added",
        additions: 2,
        deletions: 0,
        revertibility: "full",
        messageId: "m2",
        agentAfter: "new"
      }
    ]);
    await refreshPromise;

    const review = state.current.changeReview;
    expect(review?.entries.map((entry) => entry.filePath)).toEqual(["D:\\demo\\b.ts"]);
    expect(review?.dismissedAnchors?.length).toBe(1);
  });

  it("dismissAllEntries 清空列表并记录锚点", () => {
    const state = new OpenCodeStateStore("zh-cn", true);
    state.update({
      activeSessionId: "sess-1",
      sessions: [session],
      changeReview: {
        status: "ready",
        entries: [
          {
            filePath: "D:\\demo\\a.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            revertibility: "full",
            messageId: "m1",
            agentAfter: "a"
          },
          {
            filePath: "D:\\demo\\b.ts",
            status: "added",
            additions: 1,
            deletions: 0,
            revertibility: "full",
            messageId: "m1",
            agentAfter: "b"
          }
        ],
        dismissedAnchors: []
      }
    });
    const module = new ChangeReviewModule(state, () => undefined);
    module.dismissAllEntries();
    expect(state.current.changeReview?.entries).toEqual([]);
    expect(state.current.changeReview?.dismissedAnchors?.length).toBe(2);
  });

  it("全部保留后同文件新一轮变更应重新出现", async () => {
    const state = new OpenCodeStateStore("zh-cn", true);
    state.update({
      activeSessionId: "sess-1",
      sessions: [session],
      changeReview: {
        status: "ready",
        entries: [{
          filePath: "D:\\demo\\a.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          revertibility: "full",
          messageId: "m1",
          agentAfter: "v1"
        }],
        dismissedAnchors: []
      }
    });
    const module = new ChangeReviewModule(state, () => ({
      capabilities: { review: { enabled: true } },
      listSessionChangeLedger: vi.fn().mockResolvedValue([
        {
          filePath: "D:\\demo\\a.ts",
          status: "modified",
          additions: 2,
          deletions: 0,
          revertibility: "full",
          messageId: "m2",
          agentAfter: "v2"
        }
      ])
    }) as unknown as OpenCodeConnection);
    module.dismissAllEntries();
    await module.refresh("sess-1");
    expect(state.current.changeReview?.entries.map((e) => e.messageId)).toEqual(["m2"]);
  });
});
