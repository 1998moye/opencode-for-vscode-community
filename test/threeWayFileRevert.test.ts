import { describe, expect, it } from "vitest";
import { computeFileRevertPlan } from "../src/runtime/changeReview/threeWayFileRevert.js";

describe("computeFileRevertPlan", () => {
  it("当磁盘仍等于 Agent 修改后时回退到 before", () => {
    const plan = computeFileRevertPlan({
      before: "a\n",
      after: "b\n",
      current: "b\n"
    });
    expect(plan).toEqual({ kind: "revert", content: "a\n" });
  });

  it("当磁盘已等于 before 时为 noop", () => {
    const plan = computeFileRevertPlan({
      before: "a\n",
      after: "b\n",
      current: "a\n"
    });
    expect(plan).toEqual({ kind: "noop", content: "a\n" });
  });

  it("Agent 未改内容时冲突", () => {
    const plan = computeFileRevertPlan({
      before: "same",
      after: "same",
      current: "other"
    });
    expect(plan.kind).toBe("conflict");
  });

  it("新建文件回退应删除而非清空", () => {
    const plan = computeFileRevertPlan({
      before: "",
      after: "hello",
      current: "hello",
      fileExists: true,
      changeStatus: "added"
    });
    expect(plan).toEqual({ kind: "delete" });
  });

  it("删除文件回退应恢复正文", () => {
    const plan = computeFileRevertPlan({
      before: "old content",
      after: "",
      current: "",
      fileExists: false,
      changeStatus: "deleted"
    });
    expect(plan).toEqual({ kind: "revert", content: "old content" });
  });
});
