import type { Memento } from "vscode";
import { killStaleCommunityManagedServeProcesses } from "./windowsServeProcessCleanup.js";

const STORAGE_KEY = "opencodeCommunity.managedServerPorts";

/**
 * @param port - 本机 serve 端口
 */
export function rememberManagedServerPort(memento: Memento, port: number): void {
  const ports = memento.get<number[]>(STORAGE_KEY, []);
  if (ports.includes(port)) {
    return;
  }
  void memento.update(STORAGE_KEY, [...ports, port]);
}

/**
 * @param port - 已正常释放的端口
 */
export function forgetManagedServerPort(memento: Memento, port: number): void {
  const ports = memento.get<number[]>(STORAGE_KEY, []);
  const next = ports.filter((candidate) => candidate !== port);
  if (next.length === ports.length) {
    return;
  }
  void memento.update(STORAGE_KEY, next);
}

/**
 * 扩展激活时清理上次未正常 dispose 的托管 Server（及下属 Bun 等子进程）。
 */
export async function cleanupStaleManagedServersFromStorage(memento: Memento): Promise<void> {
  const ports = memento.get<number[]>(STORAGE_KEY, []);
  if (ports.length === 0) {
    return;
  }
  await killStaleCommunityManagedServeProcesses(ports);
  await memento.update(STORAGE_KEY, []);
}
