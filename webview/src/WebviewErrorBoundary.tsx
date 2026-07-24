import { Component, type ErrorInfo, type ReactNode } from "react";

interface WebviewErrorBoundaryState {
  error?: Error;
}

/**
 * 捕获 Webview 渲染错误并显示可读信息，避免整页黑屏。
 */
export class WebviewErrorBoundary extends Component<{ children: ReactNode }, WebviewErrorBoundaryState> {
  state: WebviewErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): WebviewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[OpenCode Webview]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="webview-error" role="alert">
          <strong>OpenCode 界面加载失败</strong>
          <p>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
