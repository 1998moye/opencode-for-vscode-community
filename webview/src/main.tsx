import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { connectHostMessages } from "./store";
import { postToHost } from "./vscodeApi";
import { WebviewErrorBoundary } from "./WebviewErrorBoundary";
import "./styles.css";

function showBootError(message: string): void {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.innerHTML = `<div class="webview-error" role="alert"><strong>OpenCode 界面加载失败</strong><p>${message}</p></div>`;
}

connectHostMessages();
window.addEventListener("error", (event) => {
  showBootError(event.message || "未知脚本错误");
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? "未知 Promise 错误");
  showBootError(message);
});
postToHost({ type: "surface-ready" });
window.setTimeout(() => postToHost({ type: "surface-ready" }), 800);

const mountNode = document.getElementById("root");
if (!mountNode) {
  showBootError("找不到 #root 挂载点");
} else {
  createRoot(mountNode).render(
    <StrictMode>
      <WebviewErrorBoundary>
        <App />
      </WebviewErrorBoundary>
    </StrictMode>
  );
}
