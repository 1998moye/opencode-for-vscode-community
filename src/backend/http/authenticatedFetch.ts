export function createAuthenticatedFetch(username: string, password: string): typeof fetch {
  const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const sourceHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const headers = new Headers(sourceHeaders);
    headers.set("Authorization", authorization);
    return fetch(input, { ...init, headers });
  };
}
