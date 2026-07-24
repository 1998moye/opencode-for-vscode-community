import type { CliHealth } from "../../runtime/contracts.js";
import { spawnCommand } from "../process/commandRunner.js";

export const MINIMUM_OPENCODE_VERSION = "1.17.0";

export async function inspectCliExecutable(
  executable: string,
  minimumVersion = MINIMUM_OPENCODE_VERSION
): Promise<CliHealth> {
  try {
    const output = await collectVersion(executable);
    const version = output.match(/\b(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\b/)?.[1];
    if (!version) {
      return {
        status: "error",
        executable,
        message: "无法从 OpenCode CLI 输出中识别版本号。"
      };
    }
    if (compareVersions(version, minimumVersion) < 0) {
      return {
        status: "incompatible",
        executable,
        version,
        minimumVersion,
        message: `OpenCode CLI ${version} 低于最低支持版本 ${minimumVersion}。请由用户自行升级。`
      };
    }
    return { status: "compatible", executable, version };
  } catch (error) {
    const code = isNodeError(error) ? error.code : undefined;
    if (code === "ENOENT") {
      return {
        status: "missing",
        executable,
        message: "未找到 OpenCode CLI。请先安装 OpenCode，或在设置中指定可执行文件路径。"
      };
    }
    return {
      status: "error",
      executable,
      message: error instanceof Error ? error.message : "检测 OpenCode CLI 失败。"
    };
  }
}

function collectVersion(executable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(executable, ["--version"]);
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("OpenCode CLI 版本检测超时。"));
    }, 5_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`OpenCode CLI 版本检测失败，退出码 ${code ?? "未知"}。`));
      }
    });
  });
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[.+-]/).slice(0, 3).map(Number);
  const rightParts = right.split(/[.+-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
