import * as vscode from "vscode";
import { NodeOpenCodeBackend } from "./backend/nodeOpenCodeBackend.js";
import { readBackendOptions, resolveLocale, setExternalServerPassword } from "./extension/configuration.js";
import { subscribeToRuntimeDiagnostics } from "./extension/runtimeDiagnostics.js";
import { showRuntimeNotice } from "./extension/runtimeNotifications.js";
import { chooseSessionDirectory, currentWorkspaceDirectory } from "./extension/workspaceDirectory.js";
import { createSessionSharingActions } from "./extension/sessionSharingActions.js";
import { createAttachmentActions } from "./extension/attachmentActions.js";
import { createAttachmentTempStore } from "./extension/attachmentTempStore.js";
import { createExtensionContextResolver } from "./extension/contextResolver.js";
import { handleAddContextRequest, registerEditorContextCommands } from "./extension/contextActions.js";
import {
  openOpencodeConfigFile,
  openOpencodeModelDocs
} from "./extension/opencodeModelConfig.js";
import { runProviderConnectWizard } from "./extension/providerConnectWizard.js";
import { runCliBuiltinCommand } from "./extension/cliCommands.js";
import { subscribeSelectionSync } from "./extension/terminalCapture.js";
import { createOpenCodeRuntime } from "./runtime/openCodeRuntime.js";
import type { OpenCodeRuntime, OpenCodeState } from "./runtime/contracts.js";
import { ChatEditorManager } from "./surfaces/chatEditorManager.js";
import type { SurfaceActions } from "./surfaces/chatSurface.js";
import { openFileInEditor } from "./extension/openFileInEditor.js";
import {
  openChangeDiffInEditor,
  openConflictRevertDiff,
  revertChangeFileOnDisk
} from "./extension/changeReviewActions.js";
import {
  deleteWorkspaceFile,
  readWorkspaceFileSnapshot,
  writeWorkspaceFileText
} from "./extension/workspaceFileSnapshot.js";
import {
  executeLedgerRevertBatch
} from "./extension/ledgerRevertBatch.js";
import { filterLedgerEntriesByMessageIds } from "./runtime/changeReview/sessionMessageRevert.js";
import { registerChangeReviewDiffProvider } from "./extension/changeReviewDiffContent.js";
import { subscribeChangeReviewWorkspaceSync } from "./extension/changeReviewWorkspaceSync.js";
import { ChatViewProvider } from "./surfaces/chatViewProvider.js";
import {
  cleanupStaleManagedServersFromStorage,
  forgetManagedServerPort,
  rememberManagedServerPort
} from "./backend/server/managedServerPorts.js";

let activeRuntime: OpenCodeRuntime | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;
  await cleanupStaleManagedServersFromStorage(context.globalState);
  await activeRuntime?.dispose();
  activeRuntime = undefined;
  registerChangeReviewDiffProvider(context);
  const output = vscode.window.createOutputChannel("OpenCode 社区版");
  const backendOptions = await readBackendOptions(
    context.secrets,
    (message) => output.appendLine(message),
    vscode.workspace.isTrusted
  );
  const backend = new NodeOpenCodeBackend({
    ...backendOptions,
    managedServerLifecycle: {
      onStarted: (port) => rememberManagedServerPort(context.globalState, port),
      onDisposed: (port) => forgetManagedServerPort(context.globalState, port)
    }
  });
  const initialDirectory = currentWorkspaceDirectory();
  let activeSessionId: string | undefined;
  let latestState: OpenCodeState | undefined;
  const previewWebview: { webview?: vscode.Webview } = {};
  const tempStore = createAttachmentTempStore(context.globalStorageUri.fsPath);
  const runtime = createOpenCodeRuntime({
    trusted: vscode.workspace.isTrusted,
    locale: resolveLocale(),
    ...(initialDirectory === undefined ? {} : { initialDirectory }),
    resolveNewSessionDirectory: chooseSessionDirectory,
    notify: (notice) => showRuntimeNotice(notice, { activeSessionId }),
    backend,
    resolveContext: createExtensionContextResolver({
      trusted: vscode.workspace.isTrusted,
      capabilities: () => latestState?.connection.capabilities ?? runtimeCapabilitiesDisabled(),
      resolveTempUri: (tempId) => tempStore.resolveUri(tempId)
    }),
    onContextItemRemoved: (item) => {
      void tempStore.deleteForItem(item);
    }
  });
  runtime.subscribe((state) => {
    activeSessionId = state.activeSessionId;
    latestState = state;
  });
  activeRuntime = runtime;
  const attachments = createAttachmentActions({
    runtime,
    tempStore,
    trusted: vscode.workspace.isTrusted,
    toPreviewUri: (uri) => previewWebview.webview?.asWebviewUri(uri).toString() ?? uri.toString()
  });
  void tempStore.cleanupExpired().then((result) => {
    if (result.failed > 0) {
      output.appendLine(`清理过期附件时有 ${result.failed} 项失败。`);
    }
  });

  let editor: ChatEditorManager;
  const retry = async (): Promise<void> => runtime.dispatch({ type: "initialize" });
  const sharing = createSessionSharingActions(runtime, () => latestState);
  const newSession = async (): Promise<void> => {
    const directory = await chooseSessionDirectory();
    if (directory) {
      await runtime.dispatch({ type: "create-session", directory });
    }
  };
  const deleteSession = async (sessionId: string): Promise<void> => {
    const confirmation = await vscode.window.showWarningMessage(
      "确定永久删除这个 OpenCode 会话及其消息历史吗？此操作无法撤销。",
      { modal: true },
      "删除会话"
    );
    if (confirmation === "删除会话") {
      await runtime.dispatch({ type: "delete-session", sessionId });
    }
  };
  const actions: SurfaceActions = {
    openEditor: () => editor.open(),
    openSettings: () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:Dingzhen.opencode-for-vscode-community");
    },
    openOpencodeConfig: () => openOpencodeConfigFile(),
    connectOpencodeProvider: async () => {
      const connected = await runProviderConnectWizard({
        getIntegrationPort: () => runtime.getIntegrationPort(),
        getDirectory: () => {
          const active = latestState?.sessions.find((session) => session.id === latestState?.activeSessionId);
          return active?.directory ?? initialDirectory;
        },
        fallbackExecutable: backendOptions.executable
      });
      if (connected) {
        await retry();
      }
    },
    openOpencodeModelDocs: () => openOpencodeModelDocs(),
    newSession,
    deleteSession,
    shareSession: sharing.shareSession,
    unshareSession: sharing.unshareSession,
    copyShareLink: sharing.copyShareLink,
    addContext: (kind) => kind === "attachments"
      ? attachments.pickAttachments()
      : handleAddContextRequest(runtime, kind, vscode.workspace.isTrusted),
    pickAttachments: () => attachments.pickAttachments(),
    addAttachmentBinary: (mime, filename, dataBase64) => attachments.addBinaryAttachment(mime, filename, dataBase64),
    openFile: (filePath) => openFileInEditor(filePath),
    openChangeDiff: async (filePath) => {
      const entry = findChangeLedgerEntry(latestState, filePath);
      if (!entry) {
        void vscode.window.showWarningMessage("未在变更账本中找到该文件，请先刷新审查列表。");
        return;
      }
      try {
        await openChangeDiffInEditor(entry, readWorkspaceFileSnapshot);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : "无法打开差异视图。");
      }
    },
    revertChangeFile: async (filePath) => {
      const entry = findChangeLedgerEntry(latestState, filePath);
      if (!entry) {
        void vscode.window.showWarningMessage("未在变更账本中找到该文件。");
        return;
      }
      const revertEnabled = latestState?.connection.capabilities.revert.enabled ?? false;
      if (!revertEnabled) {
        void vscode.window.showWarningMessage(latestState?.connection.capabilities.revert.reason ?? "当前连接不支持文件回退。");
        return;
      }
      const confirmLabel = entry.status === "added"
        ? "撤销新建"
        : entry.status === "deleted"
          ? "恢复文件"
          : "回退";
      const confirm = await vscode.window.showWarningMessage(
        entry.status === "added"
          ? `「${basename(filePath)}」为 Agent 新建文件。撤销新建将从磁盘删除该文件，是否继续？`
          : entry.status === "deleted"
            ? `确定恢复被 Agent 删除的文件「${basename(filePath)}」吗？`
            : `确定将「${basename(filePath)}」回退到 Agent 修改前的内容吗？`,
        { modal: true },
        confirmLabel
      );
      if (confirm !== confirmLabel) {
        return;
      }
      try {
        const outcome = await revertChangeFileOnDisk(entry, readWorkspaceFileSnapshot, writeWorkspaceFileText, deleteWorkspaceFile);
        if (outcome.status === "conflict") {
          await openConflictRevertDiff(entry, readWorkspaceFileSnapshot);
          void vscode.window.showWarningMessage(outcome.reason);
          return;
        }
        if (outcome.status === "noop") {
          const disk = await readWorkspaceFileSnapshot(filePath);
          if (entry.status === "deleted" && !disk.exists) {
            void vscode.window.showErrorMessage("未能恢复文件：磁盘上仍不存在该文件。");
            return;
          }
          void vscode.window.showInformationMessage("文件已处于回退后状态，无需写入。");
        } else if (outcome.status === "deleted") {
          void vscode.window.showInformationMessage(`已撤销新建文件：${basename(filePath)}`);
        } else if (entry.status === "deleted") {
          const disk = await readWorkspaceFileSnapshot(filePath);
          if (!disk.exists) {
            void vscode.window.showErrorMessage("未能恢复文件：写入后磁盘上仍找不到该文件。");
            return;
          }
          void vscode.window.showInformationMessage(`已恢复文件：${basename(filePath)}`);
        } else {
          void vscode.window.showInformationMessage(`已回退文件：${basename(filePath)}`);
        }
        await runtime.dispatch({ type: "dismiss-change-review-entry", filePath: entry.filePath });
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : "回退失败。");
      }
    },
    revertAllChangeFiles: async () => {
      const review = latestState?.changeReview;
      if (!review?.entries.length) {
        return;
      }
      const revertEnabled = latestState?.connection.capabilities.revert.enabled ?? false;
      if (!revertEnabled) {
        void vscode.window.showWarningMessage(latestState?.connection.capabilities.revert.reason ?? "当前连接不支持文件回退。");
        return;
      }
      const revertable = review.entries.filter((entry) => entry.revertibility === "full");
      if (revertable.length === 0) {
        void vscode.window.showWarningMessage("当前列表中的文件均不支持自动回退，仅可查看差异。");
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `确定回退 ${revertable.length} 个可自动处理的文件吗？只读项将跳过；若磁盘内容与 Agent 修改后不一致，将打开对比视图且不会自动写入。`,
        { modal: true },
        "撤销变更"
      );
      if (confirm !== "撤销变更") {
        return;
      }
      await executeLedgerRevertBatch(runtime, review.entries, {
        readFile: readWorkspaceFileSnapshot,
        writeText: writeWorkspaceFileText,
        deleteFile: deleteWorkspaceFile,
        progressTitle: "正在回退 Agent 文件变更…",
        tryMessageRevert: true
      });
    },
    revertAssistantMessageChanges: async (messageIds) => {
      const review = latestState?.changeReview;
      if (!review?.entries.length || messageIds.length === 0) {
        return;
      }
      const revertEnabled = latestState?.connection.capabilities.revert.enabled ?? false;
      if (!revertEnabled) {
        void vscode.window.showWarningMessage(latestState?.connection.capabilities.revert.reason ?? "当前连接不支持文件回退。");
        return;
      }
      const related = filterLedgerEntriesByMessageIds(review.entries, messageIds);
      if (related.length === 0) {
        return;
      }
      const revertable = related.filter((entry) => entry.revertibility === "full");
      if (revertable.length === 0) {
        void vscode.window.showWarningMessage("本条助手消息相关的文件均不支持自动回退，仅可查看差异。");
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `确定回退本条助手消息涉及的 ${revertable.length} 个文件吗？只读项将跳过；若磁盘内容与 Agent 修改后不一致，将打开对比视图且不会自动写入。`,
        { modal: true },
        "撤销文件变更"
      );
      if (confirm !== "撤销文件变更") {
        return;
      }
      await executeLedgerRevertBatch(runtime, related, {
        readFile: readWorkspaceFileSnapshot,
        writeText: writeWorkspaceFileText,
        deleteFile: deleteWorkspaceFile,
        progressTitle: "正在回退本条消息的文件变更…",
        tryMessageRevert: true
      });
    },
    dismissAllChangeReviewEntries: async () => {
      const count = latestState?.changeReview?.entries.length ?? 0;
      if (count === 0) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `将 ${count} 个文件从审查列表中移除（不修改磁盘内容），是否继续？`,
        { modal: true },
        "全部保留"
      );
      if (confirm !== "全部保留") {
        return;
      }
      await runtime.dispatch({ type: "dismiss-all-change-review-entries" });
    },
    runCliCommand: (command) => {
      const active = latestState?.sessions.find((session) => session.id === latestState?.activeSessionId);
      return runCliBuiltinCommand(command, {
        executable: backendOptions.executable,
        directory: active?.directory ?? initialDirectory,
        mcp: runtime.getMcpPort(),
        skills: runtime.getSkillPort(),
        updateDraft: (draft) => {
          void runtime.dispatch({ type: "update-draft", draft });
          void runtime.dispatch({ type: "dismiss-composer-suggestions" });
        }
      });
    },
    retry
  };
  editor = new ChatEditorManager(context.extensionUri, runtime, actions, previewWebview);
  const viewProvider = new ChatViewProvider(context.extensionUri, runtime, actions, previewWebview);

  context.subscriptions.push(
    output,
    subscribeToRuntimeDiagnostics(runtime, (message) => output.appendLine(message)),
    runtimeDisposable(runtime),
    editor,
    viewProvider,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, viewProvider),
    vscode.commands.registerCommand("opencodeCommunity.openSidebar", () =>
      vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`)
    ),
    vscode.commands.registerCommand("opencodeCommunity.openChatEditor", () => editor.open()),
    vscode.commands.registerCommand("opencodeCommunity.retryConnection", retry),
    vscode.commands.registerCommand("opencodeCommunity.newSession", newSession),
    vscode.commands.registerCommand("opencodeCommunity.setServerPassword", async () => {
      if (await setExternalServerPassword(context.secrets)) {
        void vscode.window.showInformationMessage("OpenCode Server 密码已安全保存，重新加载窗口后生效。");
      }
    }),
    vscode.commands.registerCommand("opencodeCommunity.openOpencodeConfig", () => openOpencodeConfigFile()),
    vscode.commands.registerCommand("opencodeCommunity.connectProvider", async () => {
      const connected = await runProviderConnectWizard({
        getIntegrationPort: () => runtime.getIntegrationPort(),
        getDirectory: () => {
          const active = latestState?.sessions.find((session) => session.id === latestState?.activeSessionId);
          return active?.directory ?? initialDirectory;
        },
        fallbackExecutable: backendOptions.executable
      });
      if (connected) {
        await retry();
      }
    }),
    subscribeSelectionSync(runtime, vscode.workspace.isTrusted),
    subscribeChangeReviewWorkspaceSync(
      runtime,
      () => latestState?.changeReview?.entries.length ?? 0
    ),
    registerEditorContextCommands(runtime, {
      trusted: vscode.workspace.isTrusted,
      openSidebar: () => { void vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`); },
      newSession,
      chooseDirectory: chooseSessionDirectory
    })
  );
  void retry();
}

export async function deactivate(): Promise<void> {
  await activeRuntime?.dispose();
  activeRuntime = undefined;
  if (extensionContext) {
    await cleanupStaleManagedServersFromStorage(extensionContext.globalState);
  }
}

function runtimeDisposable(runtime: OpenCodeRuntime): vscode.Disposable {
  return { dispose: () => { void runtime.dispose(); } };
}

function runtimeCapabilitiesDisabled(): OpenCodeState["connection"]["capabilities"] {
  const disabled = { enabled: false, reason: "尚未连接 OpenCode Server。" };
  return {
    chat: disabled, history: disabled, share: disabled, fileContext: disabled,
    problems: disabled, gitDiff: disabled, review: disabled, revert: disabled, pty: disabled
  };
}

function findChangeLedgerEntry(state: OpenCodeState | undefined, filePath: string) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return state?.changeReview?.entries.find(
    (entry) => entry.filePath.replace(/\\/g, "/").toLowerCase() === normalized
  );
}

function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}
