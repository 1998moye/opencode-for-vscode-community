import { describe, expect, it } from "vitest";
import {
  buildReadContentIndex,
  extractReadToolFileContent,
  normalizeLedgerStatus,
  pathsFromFindDeleteCommand,
  pathsFromGitCleanCommand,
  pathsFromGitRmCommand,
  pathsFromPowerShellRemoveItem,
  pathsFromRimrafCommand,
  pathsFromRmCommand,
  pathsFromRmdirCommand,
  pathsFromScriptDeleteSnippets,
  pathsFromShellDeleteCommand,
  pathsFromShredCommand,
  pathsFromTrashCommand,
  pathsFromUnlinkCommand,
  pathsFromWindowsDel
} from "../src/backend/gateway/sessionChangeLedgerInfer.js";

describe("sessionChangeLedgerInfer", () => {
  it("识别 removed 为 deleted", () => {
    expect(normalizeLedgerStatus("removed")).toBe("deleted");
  });

  it("从 rm 命令解析路径", () => {
    expect(pathsFromRmCommand('rm -f "./foo.ts" bar.md')).toEqual(["./foo.ts", "bar.md"]);
  });

  it("从 rmdir / rd 解析路径", () => {
    expect(pathsFromRmdirCommand("rmdir empty_dir")).toEqual(["empty_dir"]);
    expect(pathsFromRmdirCommand("rd /s /q old_folder")).toEqual(["old_folder"]);
  });

  it("从 PowerShell Remove-Item 解析 LiteralPath / -lp", () => {
    expect(pathsFromPowerShellRemoveItem(
      'Remove-Item -LiteralPath "D:\\projects\\agent_study\\current_time.py"'
    )).toEqual(["D:\\projects\\agent_study\\current_time.py"]);
    expect(pathsFromPowerShellRemoveItem('ri -lp "./gone.txt"')).toEqual(["./gone.txt"]);
    expect(pathsFromPowerShellRemoveItem("Remove-Item .\\scratch\\tmp.log -Force")).toEqual([
      ".\\scratch\\tmp.log"
    ]);
  });

  it("汇总链式与多种删除命令", () => {
    expect(pathsFromShellDeleteCommand(
      'rm a.txt && del /f b.txt; Remove-Item -Path "c.ts"'
    )).toEqual(["a.txt", "b.txt", "c.ts"]);
  });

  it("解析 unlink / git rm / git clean / trash", () => {
    expect(pathsFromUnlinkCommand("unlink ./x.py")).toEqual(["./x.py"]);
    expect(pathsFromGitRmCommand("git rm --cached -f src/old.ts")).toEqual(["src/old.ts"]);
    expect(pathsFromGitCleanCommand("git clean -fd dist")).toEqual(["dist"]);
    expect(pathsFromTrashCommand("gio trash ./draft.md")).toEqual(["./draft.md"]);
    expect(pathsFromTrashCommand("trash-put ./bin")).toEqual(["./bin"]);
    expect(pathsFromTrashCommand("gvfs-trash ./x")).toEqual(["./x"]);
  });

  it("解析 Windows del / erase 标志", () => {
    expect(pathsFromWindowsDel("cmd /c del /f /q notes.txt")).toEqual(["notes.txt"]);
    expect(pathsFromWindowsDel("erase readme.bak")).toEqual(["readme.bak"]);
  });

  it("解析 find -delete / shred / rimraf", () => {
    expect(pathsFromFindDeleteCommand("find ./src -name '*.tmp' -delete")).toEqual(["./src"]);
    expect(pathsFromFindDeleteCommand('find "/var/log" -type f -exec rm {} \\;')).toEqual(["/var/log"]);
    expect(pathsFromShredCommand("shred -u secret.txt")).toEqual(["secret.txt"]);
    expect(pathsFromRimrafCommand("npx rimraf node_modules/.cache")).toEqual(["node_modules/.cache"]);
  });

  it("解析脚本内联删除", () => {
    expect(pathsFromScriptDeleteSnippets(
      "python -c \"import os; os.remove('tmp/a.py')\""
    )).toEqual(["tmp/a.py"]);
    expect(pathsFromScriptDeleteSnippets(
      "python -c \"import shutil; shutil.rmtree('build/out')\""
    )).toEqual(["build/out"]);
    expect(pathsFromScriptDeleteSnippets(
      'node -e "require(\'fs\').rmSync(\'dist/app.js\')"'
    )).toEqual(["dist/app.js"]);
    expect(pathsFromScriptDeleteSnippets(
      'node -e "const rimraf=require(\'rimraf\'); rimraf(\'coverage\')"'
    )).toEqual(["coverage"]);
  });

  it("忽略纯通配符路径", () => {
    expect(pathsFromShellDeleteCommand("rm -rf *.pyc")).toEqual([]);
    expect(pathsFromFindDeleteCommand("find . -name '*.log' -delete")).toEqual(["."]);
  });

  it("从 Read 工具 XML 提取正文并去掉行号", () => {
    const raw = [
      "<path>D:\\\\projects\\\\agent_study\\\\projects\\\\01-api-tool\\\\current_time.ts</path>",
      "<type>file</type>",
      "<content>",
      "1: function main(): void {",
      "2:   const now = new Date();",
      "3: }",
      "(End of file - total 3 lines)",
      "</content>"
    ].join("\n");
    expect(extractReadToolFileContent(raw)).toBe(
      ["function main(): void {", "  const now = new Date();", "}"].join("\n")
    );
  });

  it("仅有 path/type 无 content 时不回写整段 XML", () => {
    expect(extractReadToolFileContent("<path>/a.py</path>\n<type>file</type>")).toBe("");
  });

  it("保留文件末尾换行", () => {
    const raw = "<content>\n1: line one\n2: \n</content>";
    expect(extractReadToolFileContent(raw)).toBe("line one\n\n");
  });

  it("buildReadContentIndex 存的是解析后的正文", () => {
    const output = "<path>/proj/a.ts</path><content>\n1|const x = 1;\n</content>";
    const index = buildReadContentIndex([
      {
        parts: [
          {
            type: "tool",
            tool: "read",
            state: {
              status: "completed",
              input: { file_path: "/proj/a.ts" },
              output
            }
          }
        ]
      }
    ]);
    expect(index.get("/proj/a.ts")?.content).toBe("const x = 1;\n");
  });
});
