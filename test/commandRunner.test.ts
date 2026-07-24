import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCommandInvocation,
  spawnCommand
} from "../src/backend/process/commandRunner.js";
import { inspectCliExecutable } from "../src/backend/cli/cliInspector.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("跨平台命令运行器", () => {
  it("在 Windows 中把 PATH 内的 npm cmd shim 交给 cmd.exe", () => {
    const invocation = createCommandInvocation("opencode", ["--version"], {
      platform: "win32",
      environment: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        PATH: "C:\\Users\\demo\\AppData\\Roaming\\npm",
        PATHEXT: ".COM;.EXE;.BAT;.CMD"
      },
      fileExists: (path) => path.toLowerCase().endsWith("opencode.cmd")
    });

    expect(invocation).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "\"\"C:\\Users\\demo\\AppData\\Roaming\\npm\\opencode.CMD\" \"--version\"\""
      ],
      windowsVerbatimArguments: true
    });
  });

  it.runIf(process.platform === "win32")("可以实际运行带空格路径中的 cmd shim", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencode command runner "));
    temporaryDirectories.push(directory);
    const shim = join(directory, "opencode.cmd");
    await writeFile(shim, "@echo off\r\necho 1.17.18\r\n", "utf8");

    const child = spawnCommand(shim, ["--version"]);
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { errorOutput += chunk.toString("utf8"); });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });

    expect({ exitCode, output: output.trim(), errorOutput: errorOutput.trim() }).toEqual({
      exitCode: 0,
      output: "1.17.18",
      errorOutput: ""
    });
  });

  it.runIf(process.env.OPENCODE_REAL_CLI_SMOKE === "1")("可以检测当前用户真实安装的 OpenCode CLI", async () => {
    const health = await inspectCliExecutable("opencode");

    expect(health.status).toBe("compatible");
  });
});
