import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { ComposerSuggestionItem, ModelCatalog } from "../../runtime/contracts.js";
import { dataOf } from "./sdkRequest.js";

/**
 * 搜索 @ 提及候选项：智能体、文件与符号。
 */
export async function searchComposerMentions(
  client: OpencodeClient,
  query: string,
  directory: string | undefined,
  catalog: ModelCatalog
): Promise<ComposerSuggestionItem[]> {
  const normalized = query.trim().toLowerCase();
  const agents = catalog.agents
    .filter((agent) => !normalized || agent.id.toLowerCase().includes(normalized))
    .map((agent) => ({
      id: `agent:${agent.id}`,
      kind: "agent" as const,
      label: agent.id,
      detail: agent.description,
      insertText: `@${agent.id} `
    }));

  if (!directory) {
    return agents;
  }

  const params = { directory };
  const queryForServer = normalized || "";
  const [files, symbols] = await Promise.allSettled([
    queryForServer
      ? dataOf(client.find.files({ ...params, query: queryForServer, limit: 20 }))
      : dataOf(client.find.files({ ...params, limit: 20 })),
    queryForServer
      ? dataOf(client.find.symbols({ ...params, query: queryForServer }))
      : Promise.resolve([])
  ]);

  const fileItems: ComposerSuggestionItem[] = files.status === "fulfilled"
    ? files.value.slice(0, 20).map((path) => ({
        id: `file:${path}`,
        kind: "file" as const,
        label: path,
        detail: "文件",
        insertText: `@${path} `,
        contextItem: {
          id: `mention-file-${path}`,
          kind: "file" as const,
          label: path,
          detail: "提及",
          source: { type: "file", uri: toFileUri(path, directory) }
        }
      }))
    : [];

  const symbolItems: ComposerSuggestionItem[] = symbols.status === "fulfilled"
    ? symbols.value.slice(0, 20).map((symbol) => ({
        id: `symbol:${symbol.location.uri}:${symbol.name}`,
        kind: "symbol" as const,
        label: symbol.name,
        detail: symbol.location.uri,
        insertText: `@${symbol.name} `,
        contextItem: {
          id: `mention-symbol-${symbol.name}-${symbol.location.uri}`,
          kind: "file" as const,
          label: symbol.name,
          detail: symbol.location.uri,
          source: {
            type: "editor-selection",
            uri: symbol.location.uri,
            startLine: symbol.location.range.start.line,
            startCharacter: symbol.location.range.start.character,
            endLine: symbol.location.range.end.line,
            endCharacter: symbol.location.range.end.character
          }
        }
      }))
    : [];

  return [...agents, ...fileItems, ...symbolItems];
}

function toFileUri(path: string, directory: string): string {
  if (path.startsWith("file:")) {
    return path;
  }
  const normalized = path.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  const base = directory.replace(/\\/g, "/").replace(/\/$/, "");
  return `file://${base}/${normalized.replace(/^\//, "")}`;
}
