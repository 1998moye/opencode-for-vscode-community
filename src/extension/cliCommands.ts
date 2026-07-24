import * as path from "node:path";
import * as vscode from "vscode";
import { spawnCommand, type SpawnedCommand } from "../backend/process/commandRunner.js";
import type { CliBuiltinCommand, McpPort, SkillPort } from "../runtime/contracts.js";
import { withTimeout } from "../utils/withTimeout.js";
import { CLI_BUILTIN_COMMANDS } from "../runtime/composer/cliBuiltinCommands.js";
import { normalizeOpenCodeDirectory } from "../backend/gateway/fetchSkills.js";

const DEBUG_INFO_TIMEOUT_MS = 10_000;

export interface CliCommandOptions {
  executable: string;
  directory: string | undefined;
  mcp: McpPort | undefined;
  skills: SkillPort | undefined;
  updateDraft: (draft: string) => void;
}

/**
 * Executes the OpenCode TUI commands that have no existing VS Code command.
 * Commands already represented by VS Code (agents, models, config, diff, exit)
 * deliberately do not appear here, so the composer has one entry point per task.
 */
export async function runCliBuiltinCommand(command: CliBuiltinCommand, options: CliCommandOptions): Promise<void> {
  switch (command) {
    case "help":
      await showCliHelp();
      return;
    case "skills":
      await pickSkill(options);
      return;
    case "debug":
      await showDebugInfo(options);
      return;
    case "mcps":
      await manageMcps(options);
      return;
  }
}

async function pickSkill(options: CliCommandOptions): Promise<void> {
  try {
    const directory = resolveSkillDirectory(options.directory);
    let skills = options.skills ? await options.skills.list(directory) : [];
    if (skills.length === 0 && options.executable) {
      skills = await listSkillsViaCli(options.executable, directory);
    }
    if (skills.length === 0) {
      void vscode.window.showInformationMessage(
        options.skills || options.executable
          ? "当前项目未发现可用技能。"
          : "当前 OpenCode Server 不支持技能列表。"
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      skills.map((skill) => ({
        label: `/${skill.name}`,
        description: skill.description,
        skillName: skill.name
      })),
      {
        placeHolder: "选择要使用的 OpenCode 技能",
        matchOnDescription: true
      }
    );
    if (!picked) {
      return;
    }
    options.updateDraft(`/${picked.skillName} `);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    void vscode.window.showErrorMessage(`无法加载 OpenCode 技能列表：${detail}`);
  }
}

/**
 * 解析技能发现目录：优先会话目录，其次当前编辑文件所在工作区根目录。
 */
export function resolveSkillDirectory(
  sessionDirectory: string | undefined,
  editorUri = vscode.window.activeTextEditor?.document.uri
): string | undefined {
  const editorFolder = editorUri
    ? vscode.workspace.getWorkspaceFolder(editorUri)?.uri.fsPath
    : undefined;
  return normalizeOpenCodeDirectory(sessionDirectory ?? editorFolder)?.replace(/\//g, path.sep);
}

/**
 * 与 CLI `opencode debug skill` 对齐的本地回退：Server API 不可用时直接扫描技能。
 */
export async function listSkillsViaCli(
  executable: string,
  directory?: string
): Promise<Array<{ name: string; description?: string }>> {
  let child: SpawnedCommand | undefined;
  try {
    const output = await withTimeout(
      new Promise<string>((resolve, reject) => {
        child = spawnCommand(executable, ["debug", "skill"], directory ? { cwd: directory } : {});
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
        child.once("error", reject);
        child.once("close", (code) => {
          const rendered = Buffer.concat([...stdout, ...stderr]).toString("utf8").trim();
          if (code === 0) {
            resolve(rendered);
            return;
          }
          reject(new Error(rendered || `OpenCode skill list exited with code ${code ?? "unknown"}.`));
        });
      }),
      DEBUG_INFO_TIMEOUT_MS,
      "OpenCode skill list timed out."
    );
    const parsed = JSON.parse(output) as Array<{ name: string; description?: string }>;
    return parsed.map((skill) => ({
      name: skill.name,
      ...(skill.description?.trim() ? { description: skill.description.trim() } : {})
    }));
  } catch {
    return [];
  } finally {
    child?.kill();
  }
}

async function showCliHelp(): Promise<void> {
  await vscode.window.showQuickPick(
    CLI_BUILTIN_COMMANDS.map(({ command, description }) => ({
      label: `/${command}`,
      description
    })),
    {
      placeHolder: "OpenCode CLI commands available in this extension",
      matchOnDescription: true
    }
  );
}

async function showDebugInfo(options: CliCommandOptions): Promise<void> {
  try {
    const output = await runDebugInfo(options.executable, options.directory);
    const document = await vscode.workspace.openTextDocument({
      content: output || "OpenCode debug info returned no output.",
      language: "text"
    });
    await vscode.window.showTextDocument(document, { preview: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    void vscode.window.showErrorMessage(`Unable to run OpenCode debug info: ${detail}`);
  }
}

async function manageMcps(options: CliCommandOptions): Promise<void> {
  if (!options.mcp) {
    void vscode.window.showWarningMessage("OpenCode Server does not expose MCP management on this connection.");
    return;
  }
  try {
    const servers = await options.mcp.list(options.directory);
    if (servers.length === 0) {
      void vscode.window.showInformationMessage("No OpenCode MCP servers are configured for this project.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      servers.map((server) => ({
        label: `${server.status === "connected" ? "$(plug)" : "$(debug-disconnect)"} ${server.name}`,
        description: server.status,
        ...(server.detail ? { detail: server.detail } : {}),
        serverName: server.name,
        action: server.status === "connected" ? "disconnect" as const : "connect" as const
      })),
      {
        placeHolder: "Select an OpenCode MCP server to connect or disconnect",
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (!picked) {
      return;
    }
    if (picked.action === "connect") {
      await options.mcp.connect(picked.serverName, options.directory);
      void vscode.window.showInformationMessage(`OpenCode MCP connected: ${picked.serverName}`);
    } else {
      await options.mcp.disconnect(picked.serverName, options.directory);
      void vscode.window.showInformationMessage(`OpenCode MCP disconnected: ${picked.serverName}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    void vscode.window.showErrorMessage(`Unable to manage OpenCode MCP servers: ${detail}`);
  }
}

export async function runDebugInfo(executable: string, directory: string | undefined): Promise<string> {
  let child: SpawnedCommand | undefined;
  try {
    const output = await withTimeout(
      new Promise<string>((resolve, reject) => {
        child = spawnCommand(executable, ["debug", "info"], directory ? { cwd: directory } : {});
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
        child.once("error", reject);
        child.once("close", (code) => {
          const rendered = Buffer.concat([...stdout, ...stderr]).toString("utf8").trim();
          if (code === 0) {
            resolve(rendered);
            return;
          }
          reject(new Error(rendered || `OpenCode debug info exited with code ${code ?? "unknown"}.`));
        });
      }),
      DEBUG_INFO_TIMEOUT_MS,
      "OpenCode debug info timed out."
    );
    return output;
  } catch (error) {
    child?.kill();
    throw error;
  }
}
