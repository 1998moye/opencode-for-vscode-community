import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { describe, expect, it } from "vitest";
import { fetchModelCatalog } from "../src/backend/gateway/fetchModelCatalog.js";

describe("fetchModelCatalog", () => {
  it("用 v1 实时目录过滤 v2 中仍标为 enabled 的失效模型", async () => {
    const model = (id: string, name: string) => ({
      id,
      providerID: "opencode",
      name,
      api: "openai",
      capabilities: { input: ["text"], output: ["text"], reasoning: false, toolcall: true, attachment: false, temperature: true },
      request: { headers: {}, body: {} },
      variants: [],
      time: { released: 0 },
      cost: [],
      status: "active",
      enabled: true,
      limit: { context: 128000, output: 4096 }
    });
    const client = {
      v2: {
        provider: {
          list: async () => ({
            data: { data: [{ id: "opencode", name: "OpenCode Zen", disabled: false }] }
          })
        },
        model: {
          list: async () => ({
            data: {
              data: [
                model("mimo-v2.5-free", "MiMo V2.5 Free"),
                model("mimo-v2-pro-free", "MiMo V2 Pro Free")
              ]
            }
          })
        },
        agent: { list: async () => ({ data: { data: [] } }) },
        integration: { list: async () => { throw new Error("unsupported"); } }
      },
      provider: {
        list: async () => ({
          data: {
            connected: ["opencode"],
            all: [{
              id: "opencode",
              name: "OpenCode Zen",
              models: {
                "mimo-v2.5-free": {
                  id: "mimo-v2.5-free",
                  providerID: "opencode",
                  name: "MiMo V2.5 Free"
                }
              }
            }]
          }
        })
      }
    } as unknown as OpencodeClient;

    const catalog = await fetchModelCatalog(client, "D:\\demo");

    expect(catalog.models.map((candidate) => candidate.id)).toEqual(["mimo-v2.5-free"]);
  });
});
