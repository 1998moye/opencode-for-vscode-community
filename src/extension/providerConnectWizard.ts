import * as vscode from "vscode";
import type {
  IntegrationConnectEntry,
  IntegrationConnectMethod,
  IntegrationConnectPort,
  IntegrationOAuthPrompt,
  OAuthConnectAttempt
} from "../runtime/contracts.js";
import { runOpencodeProviderConnectCliFallback } from "./opencodeModelConfig.js";

const OAUTH_POLL_MS = 1_500;
const OAUTH_TIMEOUT_MS = 5 * 60_000;

export interface ProviderConnectWizardOptions {
  getIntegrationPort: () => IntegrationConnectPort | undefined;
  getDirectory: () => string | undefined;
  fallbackExecutable: string;
}

/**
 * 在 VS Code 界面中完成 OpenCode 供应商连接，避免依赖终端 CLI。
 */
export async function runProviderConnectWizard(options: ProviderConnectWizardOptions): Promise<boolean> {
  const port = options.getIntegrationPort();
  if (!port) {
    const choice = await vscode.window.showWarningMessage(
      "尚未连接到 OpenCode Server，无法连接供应商。请先完成连接后再试。",
      "重新检测并连接"
    );
    if (choice === "重新检测并连接") {
      return false;
    }
    return false;
  }

  const directory = options.getDirectory();
  let integrations: IntegrationConnectEntry[];
  try {
    integrations = await port.list(directory);
  } catch (error) {
    return await offerCliFallback(
      options.fallbackExecutable,
      error instanceof Error ? error.message : "无法获取供应商列表。"
    );
  }

  if (integrations.length === 0) {
    return await offerCliFallback(options.fallbackExecutable, "当前 OpenCode Server 未返回可连接的供应商。");
  }

  const picked = await vscode.window.showQuickPick(
    integrations.map((integration) => ({
      label: integration.name,
      description: describeIntegration(integration),
      integration
    })),
    {
      placeHolder: "选择要连接的供应商",
      title: "连接 OpenCode 供应商"
    }
  );
  if (!picked) {
    return false;
  }

  const method = await pickConnectMethod(picked.integration);
  if (!method) {
    return false;
  }

  try {
    switch (method.type) {
      case "key":
        return await connectWithApiKey(port, picked.integration.id, method, directory);
      case "oauth":
        return await connectWithOAuth(port, picked.integration.id, method, directory);
      case "env":
        await showEnvMethodHelp(method);
        return false;
      default:
        return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "连接供应商失败。";
    const choice = await vscode.window.showErrorMessage(message, "改用终端连接", "关闭");
    if (choice === "改用终端连接") {
      await runOpencodeProviderConnectCliFallback(options.fallbackExecutable);
    }
    return false;
  }
}

function describeIntegration(integration: IntegrationConnectEntry): string {
  if (integration.connected) {
    return "已连接 · 可重新认证以解锁付费模型";
  }
  const methods = integration.methods.map((method) => methodLabel(method)).join("、");
  return methods ? `支持：${methods}` : "待连接";
}

function methodLabel(method: IntegrationConnectMethod): string {
  if (method.type === "oauth") {
    return method.label || "OAuth";
  }
  if (method.type === "key") {
    return method.label || "API Key";
  }
  return "环境变量";
}

async function pickConnectMethod(integration: IntegrationConnectEntry): Promise<IntegrationConnectMethod | undefined> {
  if (integration.methods.length === 0) {
    void vscode.window.showWarningMessage(`${integration.name} 没有可用的连接方式，请检查 opencode.json 配置。`);
    return undefined;
  }
  if (integration.methods.length === 1) {
    return integration.methods[0];
  }
  const picked = await vscode.window.showQuickPick(
    integration.methods.map((method) => ({
      label: methodLabel(method),
      description: method.type === "env" ? method.envNames?.join(", ") : undefined,
      method
    })),
    {
      placeHolder: `选择 ${integration.name} 的认证方式`,
      title: "认证方式"
    }
  );
  return picked?.method;
}

async function connectWithApiKey(
  port: IntegrationConnectPort,
  integrationID: string,
  method: IntegrationConnectMethod,
  directory: string | undefined
): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    title: method.label || "API Key",
    prompt: "输入供应商 API Key（仅发送至本机 OpenCode Server）",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : "请输入 API Key。")
  });
  if (!key) {
    return false;
  }
  const label = await vscode.window.showInputBox({
    title: "凭据标签（可选）",
    placeHolder: "例如：工作笔记本",
    ignoreFocusOut: true
  });
  await port.connectKey(integrationID, key.trim(), label?.trim() || undefined, directory);
  void vscode.window.showInformationMessage("供应商已连接，模型列表将自动刷新。");
  return true;
}

async function connectWithOAuth(
  port: IntegrationConnectPort,
  integrationID: string,
  method: IntegrationConnectMethod,
  directory: string | undefined
): Promise<boolean> {
  if (!method.id) {
    throw new Error("OAuth 配置缺少 methodID。");
  }
  const inputs = await collectOAuthInputs(method.oauthPrompts ?? []);
  const attempt = await port.startOAuth(integrationID, method.id, inputs, undefined, directory);
  if (attempt.instructions.trim()) {
    void vscode.window.showInformationMessage(attempt.instructions);
  }
  await vscode.env.openExternal(vscode.Uri.parse(attempt.url));

  if (attempt.mode === "code") {
    return await completeOAuthWithCode(port, attempt, directory);
  }
  return await waitForOAuthAutoComplete(port, attempt, directory);
}

async function collectOAuthInputs(prompts: IntegrationOAuthPrompt[]): Promise<Record<string, string>> {
  const inputs: Record<string, string> = {};
  for (const prompt of prompts) {
    if (!matchesWhen(inputs, prompt.when)) {
      continue;
    }
    if (prompt.type === "select") {
      const picked = await vscode.window.showQuickPick(
        (prompt.options ?? []).map((option) => ({
          label: option.label,
          description: option.hint,
          value: option.value
        })),
        {
          placeHolder: prompt.message,
          ignoreFocusOut: true
        }
      );
      if (!picked) {
        throw new Error("已取消连接。");
      }
      inputs[prompt.key] = picked.value;
      continue;
    }
    const value = await vscode.window.showInputBox({
      prompt: prompt.message,
      placeHolder: prompt.placeholder,
      ignoreFocusOut: true,
      validateInput: (candidate) => (candidate.trim() ? undefined : "此项不能为空。")
    });
    if (!value) {
      throw new Error("已取消连接。");
    }
    inputs[prompt.key] = value.trim();
  }
  return inputs;
}

async function completeOAuthWithCode(
  port: IntegrationConnectPort,
  attempt: OAuthConnectAttempt,
  directory: string | undefined
): Promise<boolean> {
  const code = await vscode.window.showInputBox({
    title: "完成授权",
    prompt: attempt.instructions || "在浏览器完成授权后，将授权码粘贴到此处。",
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : "请输入授权码。")
  });
  if (!code) {
    await port.cancelOAuth(attempt.attemptID, directory).catch(() => undefined);
    return false;
  }
  await port.completeOAuth(attempt.attemptID, code.trim(), directory);
  void vscode.window.showInformationMessage("供应商已连接，模型列表将自动刷新。");
  return true;
}

async function waitForOAuthAutoComplete(
  port: IntegrationConnectPort,
  attempt: OAuthConnectAttempt,
  directory: string | undefined
): Promise<boolean> {
  const startedAt = Date.now();
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "等待浏览器授权…",
      cancellable: true
    },
    async (_progress, token) => {
      while (!token.isCancellationRequested) {
        if (Date.now() - startedAt > OAUTH_TIMEOUT_MS) {
          await port.cancelOAuth(attempt.attemptID, directory).catch(() => undefined);
          throw new Error("授权超时，请重试。");
        }
        const status = await port.getOAuthStatus(attempt.attemptID, directory);
        if (status.status === "complete") {
          void vscode.window.showInformationMessage("供应商已连接，模型列表将自动刷新。");
          return true;
        }
        if (status.status === "failed") {
          throw new Error(status.message);
        }
        if (status.status === "expired") {
          throw new Error("授权已过期，请重试。");
        }
        await sleep(OAUTH_POLL_MS);
      }
      await port.cancelOAuth(attempt.attemptID, directory).catch(() => undefined);
      return false;
    }
  );
}

async function showEnvMethodHelp(method: IntegrationConnectMethod): Promise<void> {
  const names = method.envNames?.join("、") ?? "相关环境变量";
  const choice = await vscode.window.showInformationMessage(
    `该供应商需在系统或 opencode.json 中配置环境变量：${names}。配置后点击「重新检测并连接」刷新模型列表。`,
    "编辑 opencode.json",
    "查看文档"
  );
  if (choice === "编辑 opencode.json") {
    await vscode.commands.executeCommand("opencodeCommunity.openOpencodeConfig");
  } else if (choice === "查看文档") {
    await vscode.env.openExternal(vscode.Uri.parse("https://opencode.ai/docs/providers/"));
  }
}

async function offerCliFallback(executable: string, reason: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `${reason} 是否改用终端执行 opencode auth login？`,
    "改用终端连接",
    "取消"
  );
  if (choice === "改用终端连接") {
    await runOpencodeProviderConnectCliFallback(executable);
  }
  return false;
}

function matchesWhen(
  inputs: Record<string, string>,
  when: IntegrationOAuthPrompt["when"]
): boolean {
  if (!when) {
    return true;
  }
  const value = inputs[when.key] ?? "";
  return when.op === "eq" ? value === when.value : value !== when.value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
