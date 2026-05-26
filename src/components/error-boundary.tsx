import { Component } from "preact";
import type { ComponentChildren } from "preact";

type Props = {
  children: ComponentChildren;
  // 用 toolKey 等做 key，切工具时强制重 mount，状态清空
  // 同时给 fallback 显示用
  contextLabel?: string;
};

type State = {
  error: Error | null;
};

// Preact 错误边界。捕获子树渲染期错误，避免整个应用白屏。
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", this.props.contextLabel, error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  copyError = async () => {
    const err = this.state.error;
    if (!err) return;
    const text = `${err.message}\n\n${err.stack || ""}`.trim();
    try {
      await window.simpleImage.core.clipboard.writeText(text);
    } catch {
      // ignore — 不该再触发新的错误
    }
  };

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <section class="error-fallback">
          <div class="error-fallback-icon" aria-hidden="true">!</div>
          <strong>
            {this.props.contextLabel ? `${this.props.contextLabel}` : "这个工具"}{" "}
            渲染出错了
          </strong>
          <p class="error-fallback-message">{err.message || "未知错误"}</p>
          <details class="error-fallback-stack">
            <summary>显示完整堆栈</summary>
            <pre>{err.stack || "(无堆栈信息)"}</pre>
          </details>
          <div class="error-fallback-actions">
            <button class="action-button action-primary" onClick={this.reset}>
              重置工具
            </button>
            <button class="ghost-button" onClick={() => void this.copyError()}>
              复制错误信息
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
