import type { ComposerSelection, ModelCatalog, ModelCatalogAgent, ModelCatalogProvider, OpenCodeState } from "../../../src/runtime/contracts";
import { t } from "../i18n";

const AGENT_DESCRIPTIONS_ZH: Record<string, string> = {
  build: "默认开发智能体，拥有完整工具权限，可编辑文件与执行命令。",
  plan: "规划模式，只读分析，不会修改代码或执行命令。"
};

/**
 * 生成编写区智能体药丸的展示文案。
 */
export function formatAgentPillLabel(state: OpenCodeState): string {
  const { catalog, composerSelection, locale } = state;
  if (!catalog.loaded) {
    return t(locale, "catalogLoading");
  }
  if (catalog.error) {
    return t(locale, "catalogUnavailable");
  }
  const agent = catalog.agents.find((candidate) => candidate.id === composerSelection.agent);
  if (!agent) {
    return t(locale, "agentDefault");
  }
  return agent.name;
}

/**
 * 展示智能体说明：内置智能体使用中文文案。
 */
export function formatAgentDescription(
  agent: ModelCatalogAgent,
  locale: OpenCodeState["locale"]
): string | undefined {
  if (locale === "zh-cn") {
    return AGENT_DESCRIPTIONS_ZH[agent.id] ?? agent.description;
  }
  return agent.description;
}

/**
 * 生成编写区模型药丸的展示文案。
 */
export function formatModelPillLabel(state: OpenCodeState): string {
  const { catalog, composerSelection, locale } = state;
  if (!catalog.loaded) {
    return t(locale, "catalogLoading");
  }
  if (catalog.error) {
    return t(locale, "catalogUnavailable");
  }
  const model = catalog.models.find((candidate) =>
    candidate.providerID === composerSelection.providerID && candidate.id === composerSelection.modelID
  );
  if (!model) {
    return t(locale, "modelDefault");
  }
  return composerSelection.variant ? `${model.name} · ${composerSelection.variant}` : model.name;
}

export function placeholderForCatalog(
  catalog: ModelCatalog,
  locale: OpenCodeState["locale"],
  kind: "provider" | "model" | "agent"
): string {
  if (!catalog.loaded) {
    return t(locale, "catalogLoading");
  }
  if (catalog.error) {
    return t(locale, "catalogUnavailable");
  }
  if (kind === "provider" && catalog.providers.length === 0) {
    return t(locale, "catalogEmptyProviders");
  }
  if (kind === "model") {
    return t(locale, "modelDefault");
  }
  if (kind === "agent") {
    return t(locale, "agentDefault");
  }
  return t(locale, "providerDefault");
}

/**
 * 编写区可选的已连接供应商。
 */
export function selectableProviders(catalog: ModelCatalog): ModelCatalogProvider[] {
  return catalog.providers.filter((provider) => provider.connected);
}

/**
 * 根据供应商变更推导新的编写区选择。
 */
export function selectionForProviderChange(
  catalog: ModelCatalog,
  providerID: string
): Partial<ComposerSelection> {
  const firstModel = catalog.models.find((model) => model.providerID === providerID && model.available);
  return {
    providerID: providerID || undefined,
    modelID: firstModel?.id,
    variant: undefined
  };
}

/**
 * 根据模型变更推导新的编写区选择。
 */
export function selectionForModelChange(
  catalog: ModelCatalog,
  composerSelection: ComposerSelection,
  modelID: string
): Partial<ComposerSelection> {
  const providerModels = catalog.models.filter((model) => model.providerID === composerSelection.providerID);
  const model = providerModels.find((candidate) => candidate.id === modelID);
  if (!model?.available) {
    return {};
  }
  return {
    modelID: modelID || undefined,
    variant: undefined
  };
}

/**
 * 判断供应商是否属于 OpenCode 官方渠道。
 */
export function isOfficialOpencodeChannel(provider: ModelCatalogProvider): "zen" | "go" | undefined {
  const key = `${provider.integrationID ?? provider.id} ${provider.name}`.toLowerCase();
  if (key.includes("opencode") && key.includes("go")) {
    return "go";
  }
  if (key.includes("opencode") && key.includes("zen")) {
    return "zen";
  }
  if (key === "opencode" || key.includes("opencode-zen")) {
    return "zen";
  }
  if (key.includes("opencode-go")) {
    return "go";
  }
  return undefined;
}
