import * as vscode from "vscode";
import type { OpenCodeRuntime } from "../runtime/contracts.js";
import { ChatSurface, type SurfaceActions } from "./chatSurface.js";

export class ChatEditorManager implements vscode.Disposable {
  #panel: vscode.WebviewPanel | undefined;
  #surface: ChatSurface | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly runtime: OpenCodeRuntime,
    private readonly actions: SurfaceActions,
    private readonly previewWebview?: { webview?: vscode.Webview }
  ) {}

  open(): void {
    if (this.#panel) {
      this.#panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "opencodeCommunity.chatEditor",
      "OpenCode 社区版",
      vscode.ViewColumn.Beside,
      { enableFindWidget: true, retainContextWhenHidden: false }
    );
    this.#panel = panel;
    this.#surface = new ChatSurface(panel.webview, this.extensionUri, this.runtime, this.actions, this.previewWebview);
    panel.onDidDispose(() => {
      this.#surface?.dispose();
      this.#surface = undefined;
      this.#panel = undefined;
    });
  }

  dispose(): void {
    this.#surface?.dispose();
    this.#surface = undefined;
    this.#panel?.dispose();
    this.#panel = undefined;
  }
}
