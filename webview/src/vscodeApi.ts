import type { WebviewToHostMessage } from "../../src/surfaces/surfaceProtocol";

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void;
}

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

let api: VsCodeApi | undefined;

function getApi(): VsCodeApi | undefined {
  if (!api && typeof acquireVsCodeApi === "function") {
    api = acquireVsCodeApi();
  }
  return api;
}

export function postToHost(message: WebviewToHostMessage): void {
  getApi()?.postMessage(message);
}
