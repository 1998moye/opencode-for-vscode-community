import * as vscode from "vscode";
import { ContextModule } from "../runtime/context/contextModule.js";
import type { ContextItem } from "../runtime/contracts.js";
import { formatByteSize, textByteSize } from "../runtime/context/contextLimits.js";

interface TerminalCaptureState {
  text: string;
  limitation?: string;
  dispose: () => void;
}

const captures = new Map<string, TerminalCaptureState>();
let nextCaptureId = 1;

/**
 * 从当前时刻开始监听终端输出。
 */
export function startTerminalCapture(terminal?: vscode.Terminal): { captureId: string; limitation?: string } {
  const captureId = `terminal-${nextCaptureId++}`;
  const target = terminal ?? vscode.window.activeTerminal;
  if (!target) {
    throw new Error("没有活动终端，无法开始监听。");
  }

  let limitation: string | undefined;
  const chunks: string[] = [];
  const disposables: vscode.Disposable[] = [];

  const writeListener = (vscode.window as typeof vscode.window & {
    onDidWriteTerminalData?: (listener: (event: { terminal: vscode.Terminal; data: string }) => void) => vscode.Disposable;
  }).onDidWriteTerminalData;

  if (writeListener) {
    disposables.push(writeListener((event) => {
      if (event.terminal === target) {
        chunks.push(event.data);
      }
    }));
  } else {
    limitation = "当前环境不支持读取终端输出，仅可粘贴终端文本。";
  }

  if (!target.shellIntegration) {
    limitation = limitation
      ? `${limitation} Shell Integration 不可用。`
      : "Shell Integration 不可用，只能捕获开始监听后的输出。";
  }

  const dispose = (): void => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
    captures.delete(captureId);
  };

  captures.set(captureId, {
    text: "",
    limitation,
    dispose
  });

  const interval = setInterval(() => {
    const state = captures.get(captureId);
    if (state) {
      state.text = chunks.join("");
    }
  }, 200);
  disposables.push({ dispose: () => clearInterval(interval) });

  return { captureId, limitation };
}

/**
 * 读取终端捕获内容。
 */
export function getTerminalCapture(captureId: string): { text: string; limitation?: string } | undefined {
  const state = captures.get(captureId);
  if (!state) {
    return undefined;
  }
  return { text: state.text, limitation: state.limitation };
}

/**
 * 根据当前编辑器选区构建自动上下文项。
 */
export function buildAutoSelectionItem(editor: vscode.TextEditor): ContextItem | undefined {
  const selection = editor.selection;
  if (selection.isEmpty) {
    return undefined;
  }
  const uri = editor.document.uri.toString();
  const relative = vscode.workspace.asRelativePath(editor.document.uri);
  const selected = editor.document.getText(selection);
  const bytes = textByteSize(selected);
  return {
    id: ContextModule.autoSelectionId(),
    kind: "selection",
    label: relative,
    detail: `L${selection.start.line + 1}-${selection.end.line + 1}`,
    sizeLabel: formatByteSize(bytes),
    auto: true,
    source: {
      type: "editor-selection",
      uri,
      startLine: selection.start.line,
      startCharacter: selection.start.character,
      endLine: selection.end.line,
      endCharacter: selection.end.character
    }
  };
}

/**
 * 监听编辑器选区变化并同步自动上下文。
 */
export function subscribeSelectionSync(
  runtime: { dispatch(intent: { type: "sync-auto-selection"; item: ContextItem | null }): Promise<void> },
  trusted: boolean
): vscode.Disposable {
  if (!trusted) {
    return { dispose: () => undefined };
  }
  const sync = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void runtime.dispatch({ type: "sync-auto-selection", item: null });
      return;
    }
    const item = buildAutoSelectionItem(editor);
    void runtime.dispatch({ type: "sync-auto-selection", item: item ?? null });
  };
  sync();
  return vscode.Disposable.from(
    vscode.window.onDidChangeTextEditorSelection(sync),
    vscode.window.onDidChangeActiveTextEditor(sync)
  );
}
