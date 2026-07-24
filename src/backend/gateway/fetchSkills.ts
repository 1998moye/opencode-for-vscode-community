import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { SkillSummary } from "../../runtime/contracts.js";
import { dataOf } from "./sdkRequest.js";

interface SkillRecord {
  name: string;
  description?: string;
}

/**
 * 归一化传给 OpenCode Server 的目录路径。
 */
export function normalizeOpenCodeDirectory(directory?: string): string | undefined {
  const trimmed = directory?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\\/g, "/");
}

function mapSkillRecords(records: SkillRecord[]): SkillSummary[] {
  return records.map((skill) => ({
    name: skill.name,
    ...(skill.description?.trim() ? { description: skill.description.trim() } : {})
  }));
}

/**
 * 从 OpenCode Server 拉取可用技能列表。
 * 优先使用 v1 `app.skills`：与 CLI `/skills` 一致，会从当前目录向上扫描至 git worktree。
 * v2 `skill.list` 在部分 Server 版本下返回不完整结果，仅作回退。
 */
export async function fetchSkills(
  client: OpencodeClient,
  directory?: string
): Promise<SkillSummary[]> {
  const normalizedDirectory = normalizeOpenCodeDirectory(directory);
  const directoryQuery = normalizedDirectory ? { directory: normalizedDirectory } : {};
  const locationQuery = normalizedDirectory ? { location: { directory: normalizedDirectory } } : {};

  try {
    const fromApp = await dataOf(client.app.skills(directoryQuery));
    const mapped = mapSkillRecords(fromApp);
    if (mapped.length > 0) {
      return mapped;
    }
  } catch {
    // 旧版 Server 可能没有 app.skills，继续尝试 v2。
  }

  try {
    const response = await dataOf(client.v2.skill.list(locationQuery));
    return mapSkillRecords(response.data);
  } catch {
    return [];
  }
}
