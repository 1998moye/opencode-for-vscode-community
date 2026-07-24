import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { SlashCommandSummary } from "../../runtime/contracts.js";
import { dataOf } from "./sdkRequest.js";

interface SlashCommandRecord {
  name: string;
  description?: string;
  source?: "command" | "mcp" | "skill";
}

function formatSlashCommandDetail(command: SlashCommandRecord): string | undefined {
  const description = command.description?.trim();
  if (command.source === "skill") {
    return description ? `${description} (Skill)` : "Skill";
  }
  return description;
}

/**
 * 从 OpenCode Server 拉取斜杠命令列表。
 */
export async function fetchSlashCommands(
  client: OpencodeClient,
  directory?: string
): Promise<SlashCommandSummary[]> {
  const location = directory ? { directory } : undefined;
  const locationQuery = location ? { location } : {};
  try {
    const response = await dataOf(client.v2.command.list(locationQuery));
    return response.data.map((command) => ({
      name: command.name,
      ...(command.description?.trim() ? { description: command.description.trim() } : {})
    }));
  } catch {
    const commands = await dataOf(client.command.list(directory ? { directory } : {}));
    return commands.map((command) => ({
      name: command.name,
      ...(formatSlashCommandDetail(command) ? { description: formatSlashCommandDetail(command) } : {})
    }));
  }
}
