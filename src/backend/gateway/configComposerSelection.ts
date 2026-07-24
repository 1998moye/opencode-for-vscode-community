import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { ComposerSelection } from "../../runtime/contracts.js";
import { dataOf } from "./sdkRequest.js";

/**
 * 将 opencode.json 中的 `model` 字段解析为编写区选择。
 */
export function selectionFromConfigModel(
  model?: string,
  defaultAgent?: string
): Partial<ComposerSelection> {
  const selection: Partial<ComposerSelection> = {};
  const trimmedModel = model?.trim();
  if (trimmedModel) {
    const slash = trimmedModel.indexOf("/");
    if (slash > 0) {
      selection.providerID = trimmedModel.slice(0, slash);
      selection.modelID = trimmedModel.slice(slash + 1);
    } else {
      selection.modelID = trimmedModel;
    }
  }
  const trimmedAgent = defaultAgent?.trim();
  if (trimmedAgent) {
    selection.agent = trimmedAgent;
  }
  return selection;
}

/**
 * 将编写区选择序列化为 opencode.json 的 `model` 字段。
 */
export function formatConfigModel(selection: ComposerSelection): string | undefined {
  if (!selection.providerID || !selection.modelID) {
    return undefined;
  }
  return `${selection.providerID}/${selection.modelID}`;
}

/**
 * 读取 OpenCode 配置中的默认模型与智能体。
 */
export async function fetchDefaultComposerSelection(
  client: OpencodeClient,
  directory?: string
): Promise<Partial<ComposerSelection>> {
  try {
    const config = await dataOf(client.config.get(directory ? { directory } : {}));
    return selectionFromConfigModel(config.model, config.default_agent);
  } catch {
    return {};
  }
}

/**
 * 将编写区选择写回 OpenCode 配置（与 CLI `/models` 同级效果）。
 */
export async function persistDefaultComposerSelection(
  client: OpencodeClient,
  selection: ComposerSelection,
  directory?: string
): Promise<void> {
  const model = formatConfigModel(selection);
  if (!model && !selection.agent) {
    return;
  }
  try {
    const current = await dataOf(client.config.get(directory ? { directory } : {}));
    await dataOf(client.config.update({
      ...(directory ? { directory } : {}),
      config: {
        ...current,
        ...(model ? { model } : {}),
        ...(selection.agent ? { default_agent: selection.agent } : {})
      }
    }));
  } catch {
    // 配置写入失败不阻断会话内切换。
  }
}
