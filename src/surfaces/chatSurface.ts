import * as vscode from "vscode";
import type { CliBuiltinCommand, OpenCodeRuntime } from "../runtime/contracts.js";
import { isWebviewMessage, type HostToWebviewMessage } from "./surfaceProtocol.js";
import { createWebviewHtml } from "./webviewHtml.js";
import { 网页视图状态同步 } from "./网页视图状态同步.js";

export interface SurfaceActions {
  openEditor(): void;
  openSettings(): void;
  openOpencodeConfig(): Promise<void>;
  connectOpencodeProvider(): Promise<void>;
  openOpencodeModelDocs(): Promise<void>;
  newSession(): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  shareSession(sessionId: string): Promise<void>;
  unshareSession(sessionId: string): Promise<void>;
  copyShareLink(sessionId: string): Promise<void>;
  addContext(kind: "current-file" | "files" | "folder" | "problems" | "git-diff" | "terminal" | "terminal-paste" | "attachments"): Promise<void>;
  pickAttachments(): Promise<void>;
  addAttachmentBinary(mime: string, filename: string, dataBase64: string): Promise<void>;
  openFile(filePath: string): Promise<void>;
  openChangeDiff(filePath: string): Promise<void>;
  revertChangeFile(filePath: string): Promise<void>;
  revertAllChangeFiles(): Promise<void>;
  revertAssistantMessageChanges(messageIds: string[]): Promise<void>;
  dismissAllChangeReviewEntries(): Promise<void>;
  runCliCommand(command: CliBuiltinCommand): Promise<void>;
  retry(): Promise<void>;
}

export class ChatSurface implements vscode.Disposable {
  readonly #disposables: vscode.Disposable[] = [];

  constructor(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    runtime: OpenCodeRuntime,
    actions: SurfaceActions,
    previewWebview?: { webview?: vscode.Webview }
  ) {
    if (previewWebview) {
      previewWebview.webview = webview;
    }
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist", "webview")]
    };
    webview.html = createWebviewHtml(webview, extensionUri);
    const stateSync = new 网页视图状态同步(runtime, (message: HostToWebviewMessage) => {
      void webview.postMessage(message);
    });
    this.#disposables.push(
      webview.onDidReceiveMessage((message: unknown) => {
        if (!isWebviewMessage(message)) {
          return;
        }
        switch (message.type) {
          case "intent":
            if (message.intent.type === "run-cli-command") {
              void actions.runCliCommand(message.intent.command);
              break;
            }
            if (message.intent.type === "open-change-diff") {
              void actions.openChangeDiff(message.intent.filePath);
              break;
            }
            if (message.intent.type === "revert-change-file") {
              void actions.revertChangeFile(message.intent.filePath);
              break;
            }
            if (message.intent.type === "revert-all-change-files") {
              void actions.revertAllChangeFiles();
              break;
            }
            if (message.intent.type === "revert-assistant-message-changes") {
              void actions.revertAssistantMessageChanges(message.intent.messageIds);
              break;
            }
            if (message.intent.type === "dismiss-all-change-review-entries") {
              void actions.dismissAllChangeReviewEntries();
              break;
            }
            void runtime.dispatch(message.intent);
            break;
          case "open-editor":
            actions.openEditor();
            break;
          case "open-settings":
            actions.openSettings();
            break;
          case "open-opencode-config":
            void actions.openOpencodeConfig();
            break;
          case "connect-opencode-provider":
            void actions.connectOpencodeProvider();
            break;
          case "open-opencode-model-docs":
            void actions.openOpencodeModelDocs();
            break;
          case "new-session":
            void actions.newSession();
            break;
          case "request-delete-session":
            void actions.deleteSession(message.sessionId);
            break;
          case "request-share-session":
            void actions.shareSession(message.sessionId);
            break;
          case "request-unshare-session":
            void actions.unshareSession(message.sessionId);
            break;
          case "request-copy-share-link":
            void actions.copyShareLink(message.sessionId);
            break;
          case "request-add-context":
            void actions.addContext(message.kind);
            break;
          case "request-pick-attachments":
            void actions.pickAttachments();
            break;
          case "request-add-attachment-binary":
            void actions.addAttachmentBinary(message.mime, message.filename, message.dataBase64);
            break;
          case "request-open-file":
            void actions.openFile(message.filePath);
            break;
          case "surface-ready":
            stateSync.页面已就绪();
            void runtime.syncSurface();
            break;
          case "retry":
            void actions.retry();
            break;
        }
      }),
      stateSync
    );
  }

  dispose(): void {
    for (const disposable of this.#disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
