/**
 * 单文件三方回退计划：agent 修改前 / 修改后 / 当前磁盘。
 */
export type FileRevertPlan =
  | { kind: "revert"; content: string }
  | { kind: "delete" }
  | { kind: "noop"; content: string }
  | { kind: "conflict"; reason: string };

/**
 * 根据 Agent 修改前后内容与当前磁盘内容，计算安全回退结果。
 */
export function computeFileRevertPlan(input: {
  before: string;
  after: string;
  current: string;
  fileExists?: boolean;
  changeStatus?: "added" | "modified" | "deleted";
}): FileRevertPlan {
  const { before, after, current, changeStatus, fileExists = true } = input;

  if (changeStatus === "added" && before === "") {
    if (!fileExists) {
      return { kind: "noop", content: "" };
    }
    if (current === after || (!after && current)) {
      return { kind: "delete" };
    }
    if (after && current !== after) {
      return {
        kind: "conflict",
        reason: "新建文件在 Agent 完成后已被修改，无法安全自动删除。请手动处理。"
      };
    }
    return { kind: "delete" };
  }

  if (changeStatus === "deleted") {
    if (!before) {
      return { kind: "conflict", reason: "缺少删除前的文件内容，无法恢复。" };
    }
    if (fileExists && current === before) {
      return { kind: "noop", content: current };
    }
    return { kind: "revert", content: before };
  }

  const b = before;
  const a = after;
  const c = current;
  if (c === a) {
    return { kind: "revert", content: b };
  }
  if (c === b) {
    return { kind: "noop", content: c };
  }
  if (a === b) {
    return { kind: "conflict", reason: "Agent 未改变该文件内容。" };
  }
  const merged = tryMergeNonOverlappingUserEdits(b, a, c);
  if (merged) {
    return { kind: "revert", content: merged };
  }
  return {
    kind: "conflict",
    reason: "文件在 Agent 完成后已被修改，无法自动回退。请在三方对比中手动处理。"
  };
}

/**
 * Agent 将 before→after；用户在 after 基础上做了不重叠编辑时，尝试保留用户编辑并撤销 Agent 变更。
 */
function tryMergeNonOverlappingUserEdits(before: string, after: string, current: string): string | undefined {
  if (!after || after === before) {
    return undefined;
  }
  const prefixLen = commonPrefixLength(after, current);
  const suffixLen = commonSuffixLength(after, current, prefixLen);
  const afterMiddle = after.slice(prefixLen, after.length - suffixLen);
  const currentMiddle = current.slice(prefixLen, current.length - suffixLen);
  if (afterMiddle === currentMiddle) {
    return current;
  }
  if (!afterMiddle) {
    const beforeMiddle = before.slice(prefixLen, before.length - suffixLen);
    return `${before.slice(0, prefixLen)}${currentMiddle}${before.slice(before.length - suffixLen)}`;
  }
  const beforePrefix = before.slice(0, prefixLen);
  const beforeSuffix = before.slice(before.length - suffixLen);
  const candidate = `${beforePrefix}${currentMiddle}${beforeSuffix}`;
  if (candidate === current) {
    return before;
  }
  return undefined;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLen: number): number {
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;
  let count = 0;
  while (leftIndex >= prefixLen && rightIndex >= prefixLen && left[leftIndex] === right[rightIndex]) {
    count += 1;
    leftIndex -= 1;
    rightIndex -= 1;
  }
  return count;
}
