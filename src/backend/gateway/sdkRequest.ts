export async function dataOf<T>(request: Promise<{ data: T | undefined; error?: unknown }>): Promise<T> {
  const result = await request;
  if (result.data === undefined) {
    throw new Error(formatSdkError(result.error));
  }
  return result.data;
}

function formatSdkError(error: unknown): string {
  if (typeof error === "object" && error && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data && "message" in data) {
      return String(data.message);
    }
  }
  return "OpenCode Server 请求失败。";
}
