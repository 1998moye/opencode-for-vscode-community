import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import type { Readable } from "node:stream";

export interface CommandInvocation {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export type SpawnedCommand = ChildProcess & {
  stdout: Readable;
  stderr: Readable;
};

interface InvocationEnvironment {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  fileExists?: (path: string) => boolean;
}

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function spawnCommand(
  executable: string,
  args: string[],
  options: CommandOptions = {}
): SpawnedCommand {
  const invocation = createCommandInvocation(executable, args, {
    environment: options.env ?? process.env
  });
  return spawn(invocation.command, invocation.args, {
    ...options,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    stdio: ["ignore", "pipe", "pipe"]
  }) as SpawnedCommand;
}

export function createCommandInvocation(
  executable: string,
  args: string[],
  options: InvocationEnvironment = {}
): CommandInvocation {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    return { command: executable, args };
  }

  const environment = options.environment ?? process.env;
  const resolved = resolveWindowsExecutable(
    executable,
    environment,
    options.fileExists ?? existsSync
  );
  const extension = win32.extname(resolved).toLowerCase();
  if (extension === ".exe" || extension === ".com") {
    return { command: resolved, args };
  }
  if (extension === ".ps1") {
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", resolved, ...args]
    };
  }

  const commandProcessor = readEnvironment(environment, "ComSpec") || "cmd.exe";
  const commandLine = [resolved, ...args].map(quoteCmdToken).join(" ");
  return {
    command: commandProcessor,
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    windowsVerbatimArguments: true
  };
}

function resolveWindowsExecutable(
  executable: string,
  environment: NodeJS.ProcessEnv,
  fileExists: (path: string) => boolean
): string {
  const trimmed = executable.trim();
  if (!trimmed) {
    throw missingExecutable(executable);
  }

  const hasPath = win32.isAbsolute(trimmed) || trimmed.includes("\\") || trimmed.includes("/");
  const extension = win32.extname(trimmed);
  if (hasPath) {
    const candidates = extension ? [trimmed] : windowsCandidates(trimmed, environment);
    const match = candidates.find(fileExists);
    if (match) {
      return match;
    }
    throw missingExecutable(trimmed);
  }

  const pathValue = readEnvironment(environment, "PATH");
  const directories = pathValue?.split(";").map((entry) => stripOuterQuotes(entry.trim())).filter(Boolean) ?? [];
  const names = extension ? [trimmed] : windowsCandidates(trimmed, environment);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = win32.join(directory, name);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }
  throw missingExecutable(trimmed);
}

function windowsCandidates(executable: string, environment: NodeJS.ProcessEnv): string[] {
  const configured = readEnvironment(environment, "PATHEXT")
    ?.split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  const extensions = configured?.length ? configured : [".COM", ".EXE", ".BAT", ".CMD"];
  const supported = extensions.filter((extension) =>
    [".com", ".exe", ".bat", ".cmd"].includes(extension.toLowerCase())
  );
  return [...supported.map((extension) => `${executable}${extension}`), `${executable}.ps1`];
}

function quoteCmdToken(value: string): string {
  if (/["\r\n%!]/.test(value)) {
    throw new Error("OpenCode 可执行文件路径或启动参数包含 Windows 命令处理器不支持的字符。");
  }
  return `"${value}"`;
}

function readEnvironment(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const actual = Object.keys(environment).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return actual ? environment[actual] : undefined;
}

function stripOuterQuotes(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function missingExecutable(executable: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`未找到可执行命令：${executable}`), { code: "ENOENT" });
}
