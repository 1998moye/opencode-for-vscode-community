import type { ChangeLedgerEntry } from "../../runtime/contracts.js";

/**
 * @param text - 文件正文
 */
function countLines(text: string): number {
  if (!text) {
    return 0;
  }
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines.length;
}

/**
 * @param patch - unified diff 文本
 */
function statsFromPatch(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\n/)) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

/**
 * 对两份全文做逐行比对，估算增删行数（用于 Server 未返回统计时）。
 */
function approximateLineStats(before: string, after: string): { additions: number; deletions: number } {
  const beforeLines = before.split(/\r\n|\r|\n/);
  const afterLines = after.split(/\r\n|\r|\n/);
  let beforeIndex = 0;
  let afterIndex = 0;
  let additions = 0;
  let deletions = 0;
  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }
    if (
      beforeIndex + 1 < beforeLines.length
      && beforeLines[beforeIndex + 1] === afterLines[afterIndex]
    ) {
      deletions += 1;
      beforeIndex += 1;
      continue;
    }
    if (
      afterIndex + 1 < afterLines.length
      && beforeLines[beforeIndex] === afterLines[afterIndex + 1]
    ) {
      additions += 1;
      afterIndex += 1;
      continue;
    }
    deletions += 1;
    additions += 1;
    beforeIndex += 1;
    afterIndex += 1;
  }
  deletions += beforeLines.length - beforeIndex;
  additions += afterLines.length - afterIndex;
  return { additions, deletions };
}

/**
 * 当 Server diff 或工具分片未提供行数时，根据正文或补丁摘要推算 +/−。
 */
export function enrichChangeLedgerEntryStats(entry: ChangeLedgerEntry): ChangeLedgerEntry {
  if (entry.additions > 0 || entry.deletions > 0) {
    return entry;
  }
  if (entry.patch?.trim()) {
    const fromPatch = statsFromPatch(entry.patch);
    if (fromPatch.additions > 0 || fromPatch.deletions > 0) {
      return { ...entry, ...fromPatch };
    }
  }
  const before = entry.agentBefore ?? "";
  const after = entry.agentAfter ?? "";
  if (entry.status === "added") {
    return { ...entry, additions: countLines(after), deletions: 0 };
  }
  if (entry.status === "deleted") {
    return { ...entry, additions: 0, deletions: countLines(before) };
  }
  if (before || after) {
    return { ...entry, ...approximateLineStats(before, after) };
  }
  return entry;
}
