import { useEffect } from "preact/hooks";

// 给当前活跃的工具 view 绑定 Cmd/Ctrl + Enter 触发主操作。
// 在 input/textarea 聚焦时也允许触发，方便填完参数立刻跑。
export function usePrimaryAction(enabled: boolean, action: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.key === "Enter") {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, action]);
}
