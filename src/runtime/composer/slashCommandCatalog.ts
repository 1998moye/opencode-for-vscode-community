import type { ComposerSuggestionItem } from "../contracts.js";
import { findExtensionSlashCommandSuggestions } from "./cliBuiltinCommands.js";

/**
 * 插件 UI 已提供同等能力，不在 `/` 补全中重复展示。
 */
export const EXCLUDED_SLASH_COMMANDS = new Set([
  "agent",
  "agents",
  "auth",
  "connect",
  "connection",
  "connections",
  "diff",
  "editor",
  "exit",
  "model",
  "models",
  "provider",
  "providers",
  "quit",
  "session",
  "sessions"
]);

/**
 * 是否应在补全列表中隐藏该斜杠命令。
 */
export function isExcludedSlashCommand(name: string): boolean {
  return EXCLUDED_SLASH_COMMANDS.has(name.trim().toLowerCase());
}

/**
 * 将技能并入斜杠补全；同名时保留已有命令项。
 */
export function mergeSkillSlashSuggestions(
  commands: ComposerSuggestionItem[],
  skills: ReadonlyArray<{ name: string; description?: string }>
): ComposerSuggestionItem[] {
  const byName = new Map(commands.map((item) => [item.label.toLowerCase(), item]));
  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    if (!key || byName.has(key) || isExcludedSlashCommand(skill.name)) {
      continue;
    }
    byName.set(key, {
      id: `skill:${skill.name}`,
      kind: "slash-command",
      label: skill.name,
      ...(skill.description?.trim() ? { detail: skill.description.trim() } : {}),
      insertText: `/${skill.name} `
    });
  }
  return [...byName.values()].sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * 合并 Server 斜杠命令与扩展命令，按名称去重并排序。
 */
export function mergeSlashCommandSuggestions(
  serverItems: ComposerSuggestionItem[],
  query: string
): ComposerSuggestionItem[] {
  const byName = new Map<string, ComposerSuggestionItem>();
  for (const item of serverItems) {
    if (!isExcludedSlashCommand(item.label)) {
      byName.set(item.label.toLowerCase(), item);
    }
  }
  for (const item of findExtensionSlashCommandSuggestions(query)) {
    byName.set(item.label.toLowerCase(), item);
  }
  return [...byName.values()].sort((left, right) => left.label.localeCompare(right.label));
}
