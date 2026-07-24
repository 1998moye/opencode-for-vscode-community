import type { ComposerSuggestionItem, CliBuiltinCommand } from "../contracts.js";

export interface CliBuiltinCommandDefinition {
  command: CliBuiltinCommand;
  description: string;
}

/**
 * OpenCode TUI 中由扩展宿主承接、而非转发给 Server 的命令。
 */
export const CLI_BUILTIN_COMMANDS: readonly CliBuiltinCommandDefinition[] = [
  { command: "help", description: "Show OpenCode command help" },
  { command: "skills", description: "Skills" },
  { command: "debug", description: "View OpenCode debug information" },
  { command: "mcps", description: "Manage OpenCode MCP servers" }
];

const EXTENSION_CLI_COMMANDS = new Set<CliBuiltinCommand>(["help", "skills", "debug", "mcps"]);

/**
 * 由扩展宿主执行的 TUI 命令（help / debug / mcps）。
 */
export function isExtensionCliSlashCommand(name: string): name is CliBuiltinCommand {
  return EXTENSION_CLI_COMMANDS.has(name.trim().toLowerCase() as CliBuiltinCommand);
}

/**
 * 扩展侧实现的斜杠命令候选项。
 */
export function findExtensionSlashCommandSuggestions(query: string): ComposerSuggestionItem[] {
  const normalized = query.trim().toLowerCase();
  return CLI_BUILTIN_COMMANDS
    .filter(({ command }) => command !== "skills")
    .filter(({ command }) => !normalized || command.includes(normalized))
    .map(({ command, description }) => ({
      id: `slash:${command}`,
      kind: "slash-command" as const,
      label: command,
      detail: description,
      insertText: `/${command}`,
      cliCommand: command
    }));
}

/** @deprecated 使用 {@link findExtensionSlashCommandSuggestions} */
export const findCliBuiltinCommandSuggestions = findExtensionSlashCommandSuggestions;
