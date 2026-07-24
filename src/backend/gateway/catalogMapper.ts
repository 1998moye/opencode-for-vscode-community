import type { Agent, Provider } from "@opencode-ai/sdk/v2";
import type {
  AgentV2Info,
  ModelV2Info,
  ProviderV2Info
} from "@opencode-ai/sdk/v2";
import type { ModelCatalog, ModelCatalogAgent, ModelCatalogModel, ModelCatalogProvider, ModelInputModality, IntegrationConnectEntry } from "../../runtime/contracts.js";

/**
 * 将 v1 Provider 列表映射为统一模型目录。
 */
export function mapV1ProviderCatalog(
  providers: Provider[],
  connected: string[]
): Pick<ModelCatalog, "providers" | "models"> {
  const activeProviders = providers.filter((provider) => connected.includes(provider.id));
  const providerEntries: ModelCatalogProvider[] = activeProviders.map((provider) => ({
    id: provider.id,
    name: provider.name,
    connected: true
  }));
  const models: ModelCatalogModel[] = activeProviders.flatMap((provider) =>
    Object.values(provider.models).map((model) => mapV1Model(model))
  );
  return { providers: providerEntries, models };
}

/**
 * 将 v1 Agent 列表映射为统一智能体目录。
 */
export function mapV1AgentCatalog(agents: Agent[]): ModelCatalogAgent[] {
  return agents
    .filter((agent) => !agent.hidden && agent.mode !== "subagent")
    .map((agent) => ({
      id: agent.name,
      name: agent.name,
      description: agent.description,
      hidden: Boolean(agent.hidden),
      mode: agent.mode
    }));
}

/**
 * 将 v2 目录 API 响应映射为统一模型目录。
 */
export function mapV2Catalog(
  providers: ProviderV2Info[],
  models: ModelV2Info[],
  agents: AgentV2Info[]
): ModelCatalog {
  const activeProviders = providers.filter((provider) => !provider.disabled);
  const activeProviderIds = new Set(activeProviders.map((provider) => provider.id));
  return {
    loaded: true,
    providers: activeProviders.map((provider) => ({
      id: provider.id,
      name: provider.name,
      connected: true,
      ...(provider.integrationID ? { integrationID: provider.integrationID } : {})
    })),
    models: models
      .filter((model) => activeProviderIds.has(model.providerID))
      .map((model) => ({
        id: model.id,
        providerID: model.providerID,
        name: model.name,
        variants: model.variants.map((variant) => variant.id),
        inputModalities: normalizeModalities(model.capabilities?.input),
        available: model.enabled
      }))
      .sort(compareCatalogModels),
    agents: agents
      .filter((agent) => !agent.hidden && agent.mode !== "subagent")
      .sort(compareCatalogAgents)
      .map((agent) => ({
        id: agent.id,
        name: agent.id,
        description: agent.description,
        hidden: agent.hidden,
        mode: agent.mode
      }))
  };
}

/**
 * v2 目录包含展示元数据，但旧版 Server 可能继续把已下线模型标为 enabled。
 * v1 Provider 目录是发送请求时实际采用的模型集合，因此用它剔除幽灵模型。
 */
export function filterCatalogToRuntimeModels(
  catalog: ModelCatalog,
  providers: Array<{ id: string; models: Record<string, { id?: string }> }>
): ModelCatalog {
  const runtimeModelIDs = new Map<string, Set<string>>();
  for (const provider of providers) {
    const ids = new Set<string>();
    for (const [key, model] of Object.entries(provider.models)) {
      ids.add(key);
      if (model.id) {
        ids.add(model.id);
      }
    }
    runtimeModelIDs.set(provider.id, ids);
  }
  return {
    ...catalog,
    models: catalog.models.filter((model) => {
      const ids = runtimeModelIDs.get(model.providerID);
      return !ids || ids.has(model.id);
    })
  };
}

/**
 * 用 Integration 凭据状态同步目录里已有供应商，并仅补充已连接的新渠道。
 */
export function enrichCatalogWithIntegrations(
  catalog: ModelCatalog,
  integrations: IntegrationConnectEntry[]
): ModelCatalog {
  const providers = catalog.providers.map((provider) => {
    const integration = integrations.find((candidate) =>
      candidate.id === provider.id
      || candidate.id === provider.integrationID
      || candidate.name === provider.name
    );
    if (!integration) {
      return provider;
    }
    return {
      ...provider,
      connected: integration.connected || provider.connected,
      integrationID: provider.integrationID ?? integration.id
    };
  }).filter((provider) => provider.connected);

  for (const integration of integrations) {
    if (!integration.connected) {
      continue;
    }
    const exists = providers.some((provider) =>
      provider.id === integration.id
      || provider.integrationID === integration.id
      || provider.name === integration.name
    );
    if (exists) {
      continue;
    }
    providers.push({
      id: integration.id,
      name: integration.name,
      connected: true,
      integrationID: integration.id
    });
  }

  const activeProviderIds = new Set(providers.map((provider) => provider.id));
  return {
    ...catalog,
    providers: providers.sort(compareCatalogProviders),
    models: catalog.models.filter((model) => activeProviderIds.has(model.providerID))
  };
}

function mapV1Model(model: {
  id: string;
  providerID: string;
  name: string;
  variants?: Record<string, unknown>;
  modalities?: { input?: Array<string> };
  capabilities?: { input?: Array<string> };
}): ModelCatalogModel {
  return {
    id: model.id,
    providerID: model.providerID,
    name: model.name,
    variants: model.variants ? Object.keys(model.variants) : [],
    inputModalities: normalizeModalities(model.capabilities?.input ?? model.modalities?.input),
    available: true
  };
}

function compareCatalogAgents(left: { id: string; mode: ModelCatalogAgent["mode"] }, right: { id: string; mode: ModelCatalogAgent["mode"] }): number {
  const rank = (mode: ModelCatalogAgent["mode"]): number => {
    if (mode === "primary") {
      return 0;
    }
    if (mode === "all") {
      return 1;
    }
    return 2;
  };
  const byMode = rank(left.mode) - rank(right.mode);
  return byMode !== 0 ? byMode : left.id.localeCompare(right.id);
}

function compareCatalogModels(left: ModelCatalogModel, right: ModelCatalogModel): number {
  if (left.available !== right.available) {
    return left.available ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function compareCatalogProviders(left: ModelCatalogProvider, right: ModelCatalogProvider): number {
  const rank = (provider: ModelCatalogProvider): number => {
    const key = `${provider.integrationID ?? provider.id} ${provider.name}`.toLowerCase();
    if (key.includes("zen")) {
      return 0;
    }
    if (key.includes("go")) {
      return 1;
    }
    return 2;
  };
  const byRank = rank(left) - rank(right);
  return byRank !== 0 ? byRank : left.name.localeCompare(right.name);
}

function normalizeModalities(values: Array<string> | undefined): ModelInputModality[] {
  const allowed = new Set<ModelInputModality>(["text", "audio", "image", "video", "pdf"]);
  const normalized = (values ?? ["text"])
    .map((value) => value.toLowerCase())
    .filter((value): value is ModelInputModality => allowed.has(value as ModelInputModality));
  return normalized.length > 0 ? normalized : ["text"];
}
