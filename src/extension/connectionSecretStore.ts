const SERVER_PASSWORD_KEY = "opencodeCommunity.externalServerPassword";

export interface ConnectionSecretStorage {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
}

export async function readExternalServerPassword(storage: ConnectionSecretStorage): Promise<string> {
  return (await storage.get(SERVER_PASSWORD_KEY)) ?? "";
}

export async function saveExternalServerPassword(storage: ConnectionSecretStorage, password: string): Promise<void> {
  await storage.store(SERVER_PASSWORD_KEY, password);
}
