import { describe, expect, it } from "vitest";
import { findCliBuiltinCommandSuggestions } from "../src/runtime/composer/cliBuiltinCommands.js";

describe("OpenCode CLI command catalogue", () => {
  it("lists only CLI commands without a duplicate VS Code entry point", () => {
    expect(findCliBuiltinCommandSuggestions("").map((item) => item.label)).toEqual(["help", "debug", "mcps"]);
  });

  it("filters by slash query and retains the CLI command identity", () => {
    expect(findCliBuiltinCommandSuggestions("deb")).toMatchObject([{ label: "debug", cliCommand: "debug" }]);
  });
});
