import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

const CONFIG_SCHEMA = "https://opencode.ai/config.json";
const MODEL_DOCS_URL = "https://opencode.ai/docs/models/";
const PROVIDER_DOCS_URL = "https://opencode.ai/docs/providers/";

const CONFIG_TEMPLATE = `{
  "$schema": "${CONFIG_SCHEMA}",
  "model": "provider/model-id",
  "provider": {}
}
`;

/**
 * 打开工作区或全局 OpenCode 配置文件。
 */
export async function openOpencodeConfigFile(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const workspaceConfig = vscode.Uri.joinPath(workspaceFolder.uri, "opencode.json");
    const exists = await fileExists(workspaceConfig);
    if (!exists) {
      const choice = await vscode.window.showInformationMessage(
        "当前工作区还没有 opencode.json。模型、供应商与自定义端点应在此或全局配置中设置。",
        "创建工作区配置",
        "打开全局配置",
        "取消"
      );
      if (choice === "创建工作区配置") {
        await vscode.workspace.fs.writeFile(workspaceConfig, Buffer.from(`${CONFIG_TEMPLATE}\n`, "utf8"));
        await vscode.window.showTextDocument(workspaceConfig);
        return;
      }
      if (choice === "打开全局配置") {
        await openGlobalOpencodeConfig();
        return;
      }
      return;
    }
    await vscode.window.showTextDocument(workspaceConfig);
    return;
  }
  await openGlobalOpencodeConfig();
}

/**
 * 在终端运行 OpenCode 供应商连接流程（CLI 回退）。
 */
export async function runOpencodeProviderConnectCliFallback(executable: string): Promise<void> {
  const terminal = vscode.window.createTerminal({ name: "OpenCode" });
  terminal.show();
  terminal.sendText(`${executable} auth login`, true);
  void vscode.window.showInformationMessage(
    "请在终端完成供应商连接。完成后可点击「重新检测并连接」刷新模型列表。"
  );
}

/**
 * @deprecated 请使用 {@link runProviderConnectWizard}；保留别名以兼容旧调用。
 */
export async function runOpencodeProviderConnect(executable: string): Promise<void> {
  await runOpencodeProviderConnectCliFallback(executable);
}

/**
 * 打开 OpenCode 模型配置文档。
 */
export async function openOpencodeModelDocs(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(MODEL_DOCS_URL));
}

/**
 * 打开 OpenCode 供应商配置文档。
 */
export async function openOpencodeProviderDocs(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(PROVIDER_DOCS_URL));
}

async function openGlobalOpencodeConfig(): Promise<void> {
  const configDir = vscode.Uri.file(path.join(os.homedir(), ".config", "opencode"));
  const configFile = vscode.Uri.joinPath(configDir, "opencode.json");
  if (!(await fileExists(configFile))) {
    await vscode.workspace.fs.createDirectory(configDir);
    await vscode.workspace.fs.writeFile(configFile, Buffer.from(`${CONFIG_TEMPLATE}\n`, "utf8"));
  }
  await vscode.window.showTextDocument(configFile);
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
