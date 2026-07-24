import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { spawnCommand } from "../process/commandRunner.js";
import { killServeProcessTreesOnPort, MANAGED_SERVER_USERNAME } from "./windowsServeProcessCleanup.js";

export interface ManagedServerHandle {
  readonly url: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly exited: Promise<number | null>;
  dispose(): Promise<void>;
}

export interface ManagedServerLifecycleHooks {
  onStarted?(port: number): void;
  onDisposed?(port: number): void;
}

export async function startManagedServer(options: {
  executable: string;
  directory?: string;
  log: (message: string) => void;
  lifecycle?: ManagedServerLifecycleHooks;
}): Promise<ManagedServerHandle> {
  const port = await findFreePort();
  const username = MANAGED_SERVER_USERNAME;
  const password = randomBytes(32).toString("base64url");
  const child = spawnCommand(
    options.executable,
    ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: options.directory || tmpdir(),
      env: {
        ...process.env,
        OPENCODE_SERVER_USERNAME: username,
        OPENCODE_SERVER_PASSWORD: password
      }
    }
  );
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });
  child.stdout.on("data", (chunk: Buffer) => options.log(sanitizeProcessLine(chunk)));
  child.stderr.on("data", (chunk: Buffer) => options.log(sanitizeProcessLine(chunk)));
  options.lifecycle?.onStarted?.(port);

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    username,
    password,
    exited,
    async dispose(): Promise<void> {
      await terminateOwnedProcess(child, exited, port);
      options.lifecycle?.onDisposed?.(port);
    }
  };
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("无法分配本机 OpenCode Server 端口。"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function sanitizeProcessLine(chunk: Buffer): string {
  return chunk.toString("utf8").replace(/[\r\n]+$/g, "").slice(0, 4_000);
}

async function terminateOwnedProcess(
  child: ChildProcess,
  exited: Promise<number | null>,
  port: number
): Promise<void> {
  if (child.pid !== undefined && child.exitCode === null) {
    if (process.platform === "win32") {
      // Windows 下 SIGTERM 只终止 spawn 出来的进程本身；经 cmd.exe 包装启动时
      // 包装层一死 exited 即 resolve，会把真正的服务进程孤儿化，因此直接杀整棵进程树。
      await taskkillProcessTree(child.pid);
    } else {
      child.kill("SIGTERM");
      if (!(await settlesWithin(exited, 1_500))) {
        child.kill("SIGKILL");
      }
    }
  }
  if (process.platform === "win32") {
    await killServeProcessTreesOnPort(port);
  }
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

async function settlesWithin(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), milliseconds))
  ]);
}
