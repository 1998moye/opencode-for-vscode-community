import * as vscode from "vscode";
import type { OpenCodeRuntime } from "../runtime/contracts.js";
import { ChatSurface, type SurfaceActions } from "./chatSurface.js";

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = "opencodeCommunity.chatView";
  readonly retainContextWhenHidden = true;
  #surface: ChatSurface | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly runtime: OpenCodeRuntime,
    private readonly actions: SurfaceActions,
    private readonly previewWebview?: { webview?: vscode.Webview }
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    // 扩展热重载或视图重建时必须重新绑定 Webview，不能复用旧 surface，否则会出现空白面板。
    this.#surface?.dispose();
    this.#surface = new ChatSurface(view.webview, this.extensionUri, this.runtime, this.actions, this.previewWebview);
    view.onDidDispose(() => {
      this.#surface?.dispose();
      this.#surface = undefined;
    });
  }

  dispose(): void {
    this.#surface?.dispose();
    this.#surface = undefined;
  }
}
