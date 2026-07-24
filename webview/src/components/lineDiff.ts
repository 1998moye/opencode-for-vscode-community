export type DiffLineKind = "same" | "add" | "remove";

export type DiffLine = {
  text: string;
  kind: DiffLineKind;
};

/**
 * 按行拆分文本，保留空行。
 */
export function splitDiffLines(text: string): string[] {
  if (!text) {
    return [];
  }
  return text.replace(/\n$/, "").split("\n");
}

/**
 * 计算两段文本的行级 diff，用于 Edit 旧/新区块背景高亮。
 */
export function computeLineDiff(oldText: string, newText: string): {
  oldLines: DiffLine[];
  newLines: DiffLine[];
} {
  const oldParts = splitDiffLines(oldText);
  const newParts = splitDiffLines(newText);
  const m = oldParts.length;
  const n = newParts.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i]![j] = oldParts[i] === newParts[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: Array<
    | { type: "same"; text: string }
    | { type: "remove"; text: string }
    | { type: "add"; text: string }
  > = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldParts[i] === newParts[j]) {
      ops.push({ type: "same", text: oldParts[i]! });
      i += 1;
      j += 1;
      continue;
    }
    if (j < n && (i >= m || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      ops.push({ type: "add", text: newParts[j]! });
      j += 1;
      continue;
    }
    ops.push({ type: "remove", text: oldParts[i]! });
    i += 1;
  }
  const oldLines: DiffLine[] = [];
  const newLines: DiffLine[] = [];
  for (const op of ops) {
    if (op.type === "same") {
      oldLines.push({ text: op.text, kind: "same" });
      newLines.push({ text: op.text, kind: "same" });
    } else if (op.type === "remove") {
      oldLines.push({ text: op.text, kind: "remove" });
    } else {
      newLines.push({ text: op.text, kind: "add" });
    }
  }
  return { oldLines, newLines };
}

/**
 * Write 等全新内容：所有行标记为新增。
 */
export function markAllAdded(text: string): DiffLine[] {
  return splitDiffLines(text).map((line) => ({ text: line, kind: "add" as const }));
}
