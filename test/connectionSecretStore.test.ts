import { describe, expect, it } from "vitest";
import {
  readExternalServerPassword,
  saveExternalServerPassword
} from "../src/extension/connectionSecretStore.js";

describe("外部服务连接秘密", () => {
  it("只通过秘密存储保存并恢复密码", async () => {
    const values = new Map<string, string>();
    const storage = {
      get: async (key: string) => values.get(key),
      store: async (key: string, value: string) => { values.set(key, value); }
    };

    await saveExternalServerPassword(storage, "private-password");

    expect(await readExternalServerPassword(storage)).toBe("private-password");
    expect([...values.keys()]).toEqual(["opencodeCommunity.externalServerPassword"]);
  });
});
