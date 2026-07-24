import { describe, expect, it } from "vitest";
import { computeLineDiff, markAllAdded } from "../webview/src/components/lineDiff.js";

describe("computeLineDiff", () => {
  it("marks removed and added lines", () => {
    const oldText = "import os\nfrom openai import OpenAI\nfrom dotenv import load_dotenv\n";
    const newText = "import os\nfrom openai import OpenAI\n\ndef load_env():\n    pass\n";
    const { oldLines, newLines } = computeLineDiff(oldText, newText);
    expect(oldLines.some((line) => line.kind === "remove")).toBe(true);
    expect(newLines.some((line) => line.kind === "add")).toBe(true);
    expect(oldLines.some((line) => line.kind === "same" && line.text === "import os")).toBe(true);
  });
});

describe("markAllAdded", () => {
  it("marks every line as add", () => {
    expect(markAllAdded("a\nb")).toEqual([
      { text: "a", kind: "add" },
      { text: "b", kind: "add" }
    ]);
  });
});
