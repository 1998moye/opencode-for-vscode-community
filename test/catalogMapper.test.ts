import { describe, expect, it } from "vitest";
import { mapV1AgentCatalog, mapV2Catalog, enrichCatalogWithIntegrations } from "../src/backend/gateway/catalogMapper.js";

describe("catalogMapper", () => {
  it("v2 目录保留 build 与 plan 两个主智能体", () => {
    const catalog = mapV2Catalog([], [], [
      {
        id: "plan",
        request: { providerID: "openai", modelID: "gpt-4" },
        mode: "primary",
        hidden: false,
        permissions: []
      },
      {
        id: "build",
        request: { providerID: "openai", modelID: "gpt-4" },
        mode: "primary",
        hidden: false,
        permissions: []
      },
      {
        id: "explore",
        request: { providerID: "openai", modelID: "gpt-4" },
        mode: "subagent",
        hidden: false,
        permissions: []
      }
    ]);

    expect(catalog.agents.map((agent) => agent.id)).toEqual(["build", "plan"]);
  });

  it("v2 目录保留未启用模型并标记 available", () => {
    const catalog = mapV2Catalog(
      [{ id: "zen", name: "OpenCode Zen", api: { type: "native", settings: {} }, request: { headers: {}, body: {} } }],
      [
        {
          id: "free-model",
          providerID: "zen",
          name: "GLM-4.7 Free",
          api: "openai",
          capabilities: { input: ["text"], output: ["text"], reasoning: false, toolcall: true, attachment: false, temperature: true },
          request: { headers: {}, body: {} },
          variants: [],
          time: { released: 0 },
          cost: [],
          status: "active",
          enabled: true,
          limit: { context: 128000, output: 4096 }
        },
        {
          id: "paid-model",
          providerID: "zen",
          name: "Claude Sonnet",
          api: "openai",
          capabilities: { input: ["text"], output: ["text"], reasoning: false, toolcall: true, attachment: false, temperature: true },
          request: { headers: {}, body: {} },
          variants: [],
          time: { released: 0 },
          cost: [],
          status: "active",
          enabled: false,
          limit: { context: 128000, output: 4096 }
        }
      ],
      []
    );

    expect(catalog.models.map((model) => [model.id, model.available])).toEqual([
      ["free-model", true],
      ["paid-model", false]
    ]);
  });

  it("integration 列表仅补充已连接且目录中缺失的官方渠道", () => {
    const catalog = enrichCatalogWithIntegrations(
      {
        loaded: true,
        providers: [{ id: "opencode", name: "OpenCode Zen", connected: true }],
        models: [{ id: "free", providerID: "opencode", name: "Free", variants: [], inputModalities: ["text"], available: true }],
        agents: []
      },
      [
        {
          id: "opencode-go",
          name: "OpenCode Go",
          connected: true,
          methods: [{ type: "key", label: "API Key" }]
        },
        {
          id: "google",
          name: "Google",
          connected: false,
          methods: [{ type: "oauth", label: "OAuth", id: "google" }]
        }
      ]
    );

    expect(catalog.providers.map((provider) => provider.name)).toEqual(["OpenCode Zen", "OpenCode Go"]);
  });

  it("未连接的 integration 不会加入供应商列表", () => {
    const catalog = enrichCatalogWithIntegrations(
      {
        loaded: true,
        providers: [{ id: "opencode", name: "OpenCode Zen", connected: true }],
        models: [],
        agents: []
      },
      [
        {
          id: "opencode-go",
          name: "OpenCode Go",
          connected: false,
          methods: [{ type: "key", label: "API Key" }]
        }
      ]
    );

    expect(catalog.providers.map((provider) => provider.name)).toEqual(["OpenCode Zen"]);
  });

  it("v1 目录过滤 subagent", () => {
    const agents = mapV1AgentCatalog([
      {
        name: "build",
        mode: "primary",
        hidden: false,
        permission: [],
        options: {}
      },
      {
        name: "plan",
        mode: "primary",
        hidden: false,
        permission: [],
        options: {}
      },
      {
        name: "explore",
        mode: "subagent",
        hidden: false,
        permission: [],
        options: {}
      }
    ]);

    expect(agents.map((agent) => agent.id)).toEqual(["build", "plan"]);
  });
});
