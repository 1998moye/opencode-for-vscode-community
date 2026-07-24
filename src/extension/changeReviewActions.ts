import * as vscode from "vscode";
import type { ChangeLedgerEntry } from "../runtime/contracts.js";
import { extractReadToolFileContent } from "../backend/gateway/sessionChangeLedgerInfer.js";
import { computeFileRevertPlan } from "../runtime/changeReview/threeWayFileRevert.js";
import { openReadonlyDiff } from "./changeReviewDiffContent.js";

/**
 * 账本中的 before 可能仍是 Read 工具 XML，写盘/对比前再规范化一次。
 */
function normalizeAgentBefore(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "") {
    return "";
  }
  return extractReadToolFileContent(raw);
}

export interface WorkspaceFileSnapshot {
  exists: boolean;
  content: string;
}

/**
 * 在 VS Code 中打开 Agent 修改前/后的原生差异视图（只读，不提示保存）。
 */
export async function openChangeDiffInEditor(
  entry: ChangeLedgerEntry,
  readFile: (filePath: string) => Promise<WorkspaceFileSnapshot>
): Promise<void> {
  const title = entry.filePath.replace(/\\/g, "/").split("/").pop() ?? entry.filePath;
  const languageId = languageIdForPath(entry.filePath);
  const disk = await readFile(entry.filePath);

  const agentBefore = normalizeAgentBefore(entry.agentBefore);

  if (entry.status === "deleted" && agentBefore !== undefined) {
    await openReadonlyDiff(
      title,
      "删除前",
      agentBefore,
      "当前",
      disk.exists ? disk.content : "（文件已不存在）",
      languageId
    );
    return;
  }

  if (agentBefore !== undefined && entry.agentAfter !== undefined) {
    await openReadonlyDiff(
      title,
      "修改前",
      agentBefore,
      "修改后",
      entry.agentAfter,
      languageId
    );
    return;
  }

  const currentText = disk.exists ? disk.content : "（文件不存在）";
  await openReadonlyDiff(
    title,
    entry.patch ? "补丁摘要" : "修改前",
    entry.patch ? `# 仅补丁摘要\n\n${entry.patch}` : (agentBefore ?? "（无修改前内容）"),
    "当前磁盘",
    currentText,
    languageId
  );
}

export type RevertFileOutcome =
  | { status: "reverted" }
  | { status: "deleted" }
  | { status: "noop" }
  | { status: "conflict"; reason: string };

/**
 * 冲突时打开「修改前 ↔ 当前」与「修改前 ↔ Agent 修改后」只读对比，便于手动合并。
 */
export async function openConflictRevertDiff(
  entry: ChangeLedgerEntry,
  readFile: (filePath: string) => Promise<WorkspaceFileSnapshot>
): Promise<void> {
  const title = entry.filePath.replace(/\\/g, "/").split("/").pop() ?? entry.filePath;
  const languageId = languageIdForPath(entry.filePath);
  const disk = await readFile(entry.filePath);
  const before = normalizeAgentBefore(entry.agentBefore) ?? "";
  const after = entry.agentAfter ?? "";
  const current = disk.exists ? disk.content : "";
  await openReadonlyDiff(title, "修改前", before, "当前磁盘", current, languageId);
  if (after && after !== before) {
    await openReadonlyDiff(title, "修改前", before, "Agent 修改后", after, languageId);
  }
}

/**
 * 对单文件执行三方安全回退并写回磁盘（含新建删除与删除恢复）。
 */
export async function revertChangeFileOnDisk(
  entry: ChangeLedgerEntry,
  readFile: (filePath: string) => Promise<WorkspaceFileSnapshot>,
  writeText: (filePath: string, content: string) => Promise<void>,
  deleteFile: (filePath: string) => Promise<void>
): Promise<RevertFileOutcome> {
  if (entry.revertibility !== "full") {
    throw new Error(entry.revertBlockedReason ?? "当前连接或 Server 数据不支持自动回退此文件。");
  }
  if (entry.status === "added") {
    if (entry.agentAfter === undefined) {
      throw new Error("缺少新建文件内容，无法撤销。");
    }
  } else if (entry.agentBefore === undefined) {
    throw new Error(entry.revertBlockedReason ?? "当前连接或 Server 数据不支持自动回退此文件。");
  }
  const agentBefore = entry.agentBefore === undefined ? undefined : normalizeAgentBefore(entry.agentBefore);
  if (entry.status === "deleted" && (agentBefore === undefined || agentBefore === "")) {
    throw new Error(entry.revertBlockedReason ?? "缺少可恢复的删除前正文。");
  }
  const after = entry.agentAfter ?? "";
  const disk = await readFile(entry.filePath);
  const plan = computeFileRevertPlan({
    before: agentBefore ?? "",
    after,
    current: disk.content,
    fileExists: disk.exists,
    changeStatus: entry.status
  });
  if (plan.kind === "conflict") {
    return { status: "conflict", reason: plan.reason };
  }
  if (plan.kind === "noop") {
    return { status: "noop" };
  }
  if (plan.kind === "delete") {
    if (disk.exists) {
      await deleteFile(entry.filePath);
    }
    return { status: "deleted" };
  }
  await writeText(entry.filePath, plan.content);
  return { status: "reverted" };
}

export interface RevertAllChangeFilesResult {
  reverted: number;
  deleted: number;
  noop: number;
  skippedReadonly: number;
  conflicts: Array<{ filePath: string; reason: string }>;
  failures: Array<{ filePath: string; message: string }>;
}

/**
 * 逐文件安全回退；只读项跳过，冲突收集后统一打开对比。
 */
export async function revertAllChangeFilesOnDisk(
  entries: ChangeLedgerEntry[],
  readFile: (filePath: string) => Promise<WorkspaceFileSnapshot>,
  writeText: (filePath: string, content: string) => Promise<void>,
  deleteFile: (filePath: string) => Promise<void>
): Promise<RevertAllChangeFilesResult> {
  const result: RevertAllChangeFilesResult = {
    reverted: 0,
    deleted: 0,
    noop: 0,
    skippedReadonly: 0,
    conflicts: [],
    failures: []
  };
  for (const entry of entries) {
    if (entry.revertibility !== "full") {
      result.skippedReadonly += 1;
      continue;
    }
    try {
      const outcome = await revertChangeFileOnDisk(entry, readFile, writeText, deleteFile);
      if (outcome.status === "reverted") {
        result.reverted += 1;
      } else if (outcome.status === "deleted") {
        result.deleted += 1;
      } else if (outcome.status === "noop") {
        result.noop += 1;
      } else {
        result.conflicts.push({ filePath: entry.filePath, reason: outcome.reason });
        await openConflictRevertDiff(entry, readFile);
      }
    } catch (error) {
      result.failures.push({
        filePath: entry.filePath,
        message: error instanceof Error ? error.message : "回退失败。"
      });
    }
  }
  return result;
}

function languageIdForPath(filePath: string): string {
  const name = filePath.replace(/\\/g, "/").split("/").pop() ?? "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python"
  };
  return map[ext] ?? "plaintext";
}
