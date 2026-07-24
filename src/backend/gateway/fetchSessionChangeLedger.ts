import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Part } from "@opencode-ai/sdk/v2";
import type { ChangeLedgerEntry, SessionSummary } from "../../runtime/contracts.js";
import { dataOf } from "./sdkRequest.js";
import {
  buildReadContentIndex,
  extractReadToolFileContent,
  lookupReadContent,
  normalizeLedgerStatus,
  pathsFromShellDeleteCommand,
  resolvePathUnderDirectory
} from "./sessionChangeLedgerInfer.js";
import { enrichChangeLedgerEntryStats } from "./sessionChangeLedgerStats.js";

function pickPath(input: Record<string, unknown>): string | undefined {
  const candidate = input.file_path ?? input.filePath ?? input.path;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function pickString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

function upsertEntry(
  map: Map<string, ChangeLedgerEntry>,
  filePath: string,
  patch: Partial<ChangeLedgerEntry>
): void {
  const key = normalizePath(filePath);
  const existing = map.get(key);
  const patchBefore = patch.agentBefore;
  const mergedBefore =
    patchBefore !== undefined
      ? (patchBefore === "" ? "" : extractReadToolFileContent(patchBefore))
      : existing?.agentBefore;
  const normalizedBefore =
    mergedBefore === ""
      ? ""
      : mergedBefore !== undefined && mergedBefore !== ""
        ? extractReadToolFileContent(mergedBefore)
        : mergedBefore;
  map.set(key, {
    filePath,
    status: patch.status ?? existing?.status ?? "modified",
    additions: patch.additions ?? existing?.additions ?? 0,
    deletions: patch.deletions ?? existing?.deletions ?? 0,
    ...(existing?.messageId ? { messageId: existing.messageId } : {}),
    ...(patch.messageId ? { messageId: patch.messageId } : {}),
    ...(normalizedBefore !== undefined ? { agentBefore: normalizedBefore } : {}),
    ...(existing?.agentAfter !== undefined || patch.agentAfter !== undefined
      ? { agentAfter: patch.agentAfter ?? existing?.agentAfter }
      : {}),
    ...(existing?.patch || patch.patch ? { patch: patch.patch ?? existing?.patch } : {}),
    revertibility: patch.revertibility ?? existing?.revertibility ?? "readonly",
    ...(patch.revertBlockedReason ?? existing?.revertBlockedReason
      ? { revertBlockedReason: patch.revertBlockedReason ?? existing?.revertBlockedReason }
      : {})
  });
  const merged = map.get(key)!;
  const hasBefore = merged.agentBefore !== undefined;
  const hasAfter = merged.agentAfter !== undefined;
  if (hasBefore && hasAfter && merged.status !== "deleted") {
    merged.revertibility = "full";
    delete merged.revertBlockedReason;
  } else if (merged.status === "added" && merged.agentAfter !== undefined) {
    merged.revertibility = "full";
    delete merged.revertBlockedReason;
  } else if (merged.status === "deleted" && hasBefore && merged.agentAfter !== undefined) {
    merged.revertibility = "full";
    delete merged.revertBlockedReason;
  }
}

function absorbToolPart(
  map: Map<string, ChangeLedgerEntry>,
  messageId: string,
  part: Extract<Part, { type: "tool" }>,
  session: SessionSummary,
  readIndex: Map<string, { filePath: string; content: string }>
): void {
  const state = part.state;
  if (state.status !== "completed") {
    return;
  }
  const input = (state.input ?? {}) as Record<string, unknown>;
  const tool = part.tool.toLowerCase().replace(/[^a-z0-9]/g, "");
  const filePath = pickPath(input);
  if (tool === "bash" || tool === "shell" || tool === "powershell") {
    const command = pickString(input, "command");
    if (command) {
      for (const target of pathsFromShellDeleteCommand(command)) {
        const resolved = resolvePathUnderDirectory(session.directory, target);
        const fromRead = lookupReadContent(readIndex, resolved);
        const existing = map.get(normalizePath(resolved));
        const before = fromRead?.content ?? existing?.agentBefore;
        upsertEntry(map, resolved, {
          status: "deleted",
          messageId,
          agentAfter: "",
          ...(before
            ? { agentBefore: before, revertibility: "full" as const }
            : {
              revertibility: "readonly" as const,
              revertBlockedReason: "删除由 shell 执行且缺少删除前正文，无法自动恢复。"
            })
        });
      }
    }
  }
  if (!filePath) {
    return;
  }
  if (tool === "write") {
    const content = input.content;
    if (typeof content !== "string") {
      return;
    }
    upsertEntry(map, filePath, {
      status: "added",
      messageId,
      agentBefore: "",
      agentAfter: content,
      revertibility: "full"
    });
    return;
  }
  if (tool.includes("delete") || tool === "remove" || tool === "unlink") {
    const output = state.status === "completed" && "output" in state && typeof state.output === "string"
      ? state.output
      : undefined;
    const fromRead = lookupReadContent(readIndex, filePath);
    const before = pickString(input, "content", "old_string", "oldString", "previous")
      ?? (output && output.length > 0 ? extractReadToolFileContent(output) : undefined)
      ?? fromRead?.content;
    upsertEntry(map, filePath, {
      status: "deleted",
      messageId,
      agentBefore: before ?? "",
      agentAfter: "",
      revertibility: before ? "full" : "readonly",
      ...(before ? {} : { revertBlockedReason: "缺少删除前正文，无法自动恢复文件。" })
    });
    return;
  }
  if (tool === "edit") {
    const fullContent = pickString(input, "content", "new_string", "newString", "text");
    const oldString = pickString(input, "old_string", "oldString", "oldText");
    const newString = pickString(input, "new_string", "newString", "newText", "replace", "insert");
    if (typeof fullContent === "string") {
      upsertEntry(map, filePath, {
        status: "modified",
        messageId,
        agentAfter: fullContent,
        revertibility: oldString ? "full" : "readonly",
        ...(oldString
          ? { agentBefore: oldString, agentAfter: fullContent }
          : { revertBlockedReason: "缺少修改前全文，仅可查看差异。" })
      });
      return;
    }
    if (oldString && newString) {
      upsertEntry(map, filePath, {
        status: "modified",
        messageId,
        revertibility: "readonly",
        revertBlockedReason: "仅有片段替换信息，请用差异视图核对后再手动调整。"
      });
    }
  }
}

/**
 * 从 OpenCode 会话 diff 与工具分片重建变更账本（无独立快照库）。
 */
export async function fetchSessionChangeLedger(
  client: OpencodeClient,
  session: SessionSummary
): Promise<ChangeLedgerEntry[]> {
  const byPath = new Map<string, ChangeLedgerEntry>();
  let messageEntries: Array<{ info: { id: string }; parts: Part[] }> = [];
  try {
    const response = await dataOf(client.session.messages({
      sessionID: session.id,
      directory: session.directory,
      limit: 500
    }));
    messageEntries = response;
  } catch {
    messageEntries = [];
  }
  const readIndex = buildReadContentIndex(messageEntries);
  try {
    const diffs = await dataOf(client.session.diff({
      sessionID: session.id,
      directory: session.directory
    }));
    for (const diff of diffs) {
      if (!diff.file) {
        continue;
      }
      const raw = diff as Record<string, unknown>;
      const status = normalizeLedgerStatus(raw.status);
      const before = pickString(raw, "before");
      const after = pickString(raw, "after");
      const readFallback = lookupReadContent(readIndex, diff.file);
      const patch: Partial<ChangeLedgerEntry> = {
        status,
        additions: diff.additions,
        deletions: diff.deletions,
        patch: diff.patch,
        revertibility: "readonly",
        revertBlockedReason: "服务端仅提供补丁摘要；含全文的工具记录可支持自动回退。"
      };
      if (before !== undefined) {
        patch.agentBefore = before;
      } else if (status === "deleted" && readFallback?.content) {
        patch.agentBefore = readFallback.content;
      }
      if (after !== undefined) {
        patch.agentAfter = after;
      }
      if (status === "deleted") {
        patch.agentAfter = after ?? "";
        if (patch.agentBefore !== undefined && patch.agentBefore !== "") {
          patch.revertibility = "full";
          delete patch.revertBlockedReason;
        } else if (readFallback?.content) {
          patch.agentBefore = readFallback.content;
          patch.revertibility = "full";
          delete patch.revertBlockedReason;
        }
      }
      if (status === "added" && after !== undefined) {
        patch.agentBefore = before !== undefined ? before : "";
        patch.agentAfter = after;
        patch.revertibility = "full";
        delete patch.revertBlockedReason;
      }
      upsertEntry(byPath, diff.file, patch);
    }
  } catch {
    // 能力缺失时仍尝试从消息工具分片构建。
  }
  for (const entry of messageEntries) {
    for (const part of entry.parts) {
      if (part.type === "tool") {
        absorbToolPart(byPath, entry.info.id, part, session, readIndex);
      }
    }
  }
  return [...byPath.values()]
    .map(enrichChangeLedgerEntryStats)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}
