import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type {
  IntegrationConnectEntry,
  IntegrationConnectMethod,
  IntegrationConnectPort,
  IntegrationOAuthPrompt,
  OAuthConnectAttempt,
  OAuthConnectStatus
} from "../../runtime/contracts.js";
import { dataOf } from "./sdkRequest.js";

/**
 * 基于 OpenCode v2 Integration API 的供应商连接端口。
 */
export class SdkIntegrationConnectPort implements IntegrationConnectPort {
  constructor(private readonly client: OpencodeClient) {}

  async list(directory?: string): Promise<IntegrationConnectEntry[]> {
    const location = directory ? { directory } : undefined;
    const response = await dataOf(this.client.v2.integration.list(location ? { location } : {}));
    return response.data.map((integration) => ({
      id: integration.id,
      name: integration.name,
      connected: integration.connections.some((connection) => connection.type === "credential"),
      methods: integration.methods.map(mapMethod)
    }));
  }

  async connectKey(
    integrationID: string,
    key: string,
    label?: string,
    directory?: string
  ): Promise<void> {
    const location = directory ? { directory } : undefined;
    await dataOf(this.client.v2.integration.connect.key({
      integrationID,
      key,
      label,
      ...(location ? { location } : {})
    }));
  }

  async startOAuth(
    integrationID: string,
    methodID: string,
    inputs: Record<string, string>,
    label?: string,
    directory?: string
  ): Promise<OAuthConnectAttempt> {
    const location = directory ? { directory } : undefined;
    const response = await dataOf(this.client.v2.integration.connect.oauth({
      integrationID,
      methodID,
      inputs,
      label,
      ...(location ? { location } : {})
    }));
    return {
      attemptID: response.data.attemptID,
      url: response.data.url,
      instructions: response.data.instructions,
      mode: response.data.mode
    };
  }

  async getOAuthStatus(attemptID: string, directory?: string): Promise<OAuthConnectStatus> {
    const location = directory ? { directory } : undefined;
    const response = await dataOf(this.client.v2.integration.attempt.status({
      attemptID,
      ...(location ? { location } : {})
    }));
    const status = response.data.status;
    if (status === "failed") {
      return { status: "failed", message: response.data.message };
    }
    return { status };
  }

  async completeOAuth(attemptID: string, code: string, directory?: string): Promise<void> {
    const location = directory ? { directory } : undefined;
    await dataOf(this.client.v2.integration.attempt.complete({
      attemptID,
      code,
      ...(location ? { location } : {})
    }));
  }

  async cancelOAuth(attemptID: string, directory?: string): Promise<void> {
    const location = directory ? { directory } : undefined;
    await dataOf(this.client.v2.integration.attempt.cancel({
      attemptID,
      ...(location ? { location } : {})
    }));
  }
}

function mapMethod(method: {
  type: "oauth" | "key" | "env";
  id?: string;
  label?: string;
  names?: string[];
  prompts?: Array<{
    type: "text" | "select";
    key: string;
    message: string;
    placeholder?: string;
    options?: Array<{ label: string; value: string; hint?: string }>;
    when?: { key: string; op: "eq" | "neq"; value: string };
  }>;
}): IntegrationConnectMethod {
  if (method.type === "oauth") {
    return {
      type: "oauth",
      id: method.id,
      label: method.label,
      oauthPrompts: method.prompts?.map(mapPrompt)
    };
  }
  if (method.type === "env") {
    return {
      type: "env",
      label: method.label ?? method.names?.join(", ") ?? "环境变量",
      envNames: method.names
    };
  }
  return {
    type: "key",
    label: method.label ?? "API Key"
  };
}

function mapPrompt(prompt: {
  type: "text" | "select";
  key: string;
  message: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string; hint?: string }>;
  when?: { key: string; op: "eq" | "neq"; value: string };
}): IntegrationOAuthPrompt {
  return {
    type: prompt.type,
    key: prompt.key,
    message: prompt.message,
    placeholder: prompt.placeholder,
    options: prompt.options,
    when: prompt.when
  };
}
