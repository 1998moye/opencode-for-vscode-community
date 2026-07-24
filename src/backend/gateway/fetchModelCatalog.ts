import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { ModelCatalog } from "../../runtime/contracts.js";
import {
  enrichCatalogWithIntegrations,
  filterCatalogToRuntimeModels,
  mapV1AgentCatalog,
  mapV1ProviderCatalog,
  mapV2Catalog
} from "./catalogMapper.js";
import { SdkIntegrationConnectPort } from "./integrationConnectPort.js";
import { dataOf } from "./sdkRequest.js";

const emptyCatalog = (): ModelCatalog => ({
  loaded: false,
  providers: [],
  models: [],
  agents: []
});

/**
 * 从 OpenCode Server 拉取模型供应商、模型与智能体目录。
 */
export async function fetchModelCatalog(
  client: OpencodeClient,
  directory?: string
): Promise<ModelCatalog> {
  const location = directory ? { directory } : undefined;
  const locationQuery = location ? { location } : {};
  try {
    const [providerResult, modelResult, agentResult, runtimeProviderResult] = await Promise.allSettled([
      dataOf(client.v2.provider.list(locationQuery)),
      dataOf(client.v2.model.list(locationQuery)),
      dataOf(client.v2.agent.list(locationQuery)),
      dataOf(client.provider.list(directory ? { directory } : {}))
    ]);
    if (
      providerResult.status === "fulfilled"
      && modelResult.status === "fulfilled"
      && agentResult.status === "fulfilled"
    ) {
      let catalog = mapV2Catalog(
        providerResult.value.data,
        modelResult.value.data,
        agentResult.value.data
      );
      if (runtimeProviderResult.status === "fulfilled") {
        catalog = filterCatalogToRuntimeModels(catalog, runtimeProviderResult.value.all);
      }
      try {
        const integrations = await new SdkIntegrationConnectPort(client).list(directory);
        return enrichCatalogWithIntegrations(catalog, integrations);
      } catch {
        return catalog;
      }
    }
  } catch {
    // 回退到 v1 接口
  }

  try {
    const [providersResponse, agents] = await Promise.all([
      dataOf(client.provider.list(directory ? { directory } : {})),
      dataOf(client.app.agents(directory ? { directory } : {}))
    ]);
    const mapped = mapV1ProviderCatalog(providersResponse.all, providersResponse.connected);
    return {
      loaded: true,
      providers: mapped.providers,
      models: mapped.models,
      agents: mapV1AgentCatalog(agents)
    };
  } catch (error) {
    return {
      ...emptyCatalog(),
      loaded: true,
      error: error instanceof Error ? error.message : "加载模型目录失败。"
    };
  }
}
