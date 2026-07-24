import { describe, expect, it } from "vitest";
import type { ComposerSuggestionItem } from "../src/runtime/contracts.js";
import { isExcludedSlashCommand, mergeSkillSlashSuggestions, mergeSlashCommandSuggestions } from "../src/runtime/composer/slashCommandCatalog.js";

describe("slashCommandCatalog", () => {
  it("filters plugin-owned slash commands from server suggestions", () => {
    const serverItems: ComposerSuggestionItem[] = [
      { id: "slash:init", kind: "slash-command", label: "init", insertText: "/init " },
      { id: "slash:models", kind: "slash-command", label: "models", insertText: "/models " },
      { id: "slash:agents", kind: "slash-command", label: "agents", insertText: "/agents " }
    ];

    expect(mergeSlashCommandSuggestions(serverItems, "").map((item) => item.label)).toEqual([
      "debug",
      "help",
      "init",
      "mcps"
    ]);
  });

  it("将技能并入斜杠补全且不与已有命令重名", () => {
    const commands: ComposerSuggestionItem[] = [
      { id: "slash:init", kind: "slash-command", label: "init", insertText: "/init " }
    ];
    const merged = mergeSkillSlashSuggestions(commands, [
      { name: "grilling", description: "Grill the user" },
      { name: "init", description: "duplicate" }
    ]);
    expect(merged.map((item) => item.label)).toEqual(["grilling", "init"]);
    expect(merged.find((item) => item.label === "grilling")).toMatchObject({
      insertText: "/grilling ",
      detail: "Grill the user"
    });
  });

  it("recognises excluded command names case-insensitively", () => {
    expect(isExcludedSlashCommand("Models")).toBe(true);
    expect(isExcludedSlashCommand("init")).toBe(false);
  });
});
