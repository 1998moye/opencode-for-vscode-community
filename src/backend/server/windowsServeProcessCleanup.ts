import { spawn } from "node:child_process";

/**
 * 本插件托管 Server 使用的认证用户名（用于识别孤儿进程，仅作辅助）。
 */
export const MANAGED_SERVER_USERNAME = "opencode-vscode";

/**
 * 在 Windows 上按监听端口结束 opencode serve 进程树（含 Bun 等子进程）。
 */
export async function killServeProcessTreesOnPort(port: number): Promise<void> {
  if (process.platform !== "win32" || !Number.isFinite(port) || port <= 0) {
    return;
  }
  const pids = await findServeProcessIdsOnPort(port);
  await Promise.all(pids.map((pid) => taskkillProcessTree(pid)));
}

/**
 * 结束本插件可能遗留的 127.0.0.1 serve 实例（扩展重载/崩溃后）。
 */
export async function killStaleCommunityManagedServeProcesses(ports: number[]): Promise<void> {
  const unique = [...new Set(ports.filter((port) => port > 0))];
  await Promise.all(unique.map((port) => killServeProcessTreesOnPort(port)));
}

async function findServeProcessIdsOnPort(port: number): Promise<number[]> {
  const needle = String(port);
  const script = [
    "$pids = @()",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.CommandLine -and",
    "  ($_.CommandLine -match 'serve') -and",
    "  ($_.CommandLine -match '127\\.0\\.0\\.1') -and",
    "  ($_.CommandLine -match '--port') -and",
    `  ($_.CommandLine -match '${needle}')`,
    "} | ForEach-Object { $pids += $_.ProcessId }",
    "$pids | Sort-Object -Unique"
  ].join(" ");
  const output = await runPowerShell(script);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map((line) => Number(line));
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", () => resolve(""));
    child.once("exit", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function taskkillProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.once("error", () => resolve());
    killer.once("exit", () => resolve());
  });
}
