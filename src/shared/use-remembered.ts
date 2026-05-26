import { useEffect, useRef } from "preact/hooks";

// 给某个 namespace key 关联一个 state 字段：
// - 首次挂载时从 settings 读取并 patch 进 state
// - 后续 value 变化时（非首次）自动写回 settings
//
// 用法：
//   useRemembered("tool:compress:outputDir", state.outputDir, (v) => patch({ outputDir: v }));
export function useRemembered<T>(
  key: string,
  value: T,
  apply: (value: T) => void,
) {
  const loadedRef = useRef(false);

  // 启动：从 settings 加载
  useEffect(() => {
    let cancelled = false;
    void window.simpleImage.core.settings.get<T | null>(key, null).then((saved) => {
      if (!cancelled) {
        if (saved !== null && saved !== undefined && saved !== "") {
          apply(saved);
        }
        loadedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 后续：value 变化时写回 settings（跳过首次加载）
  useEffect(() => {
    if (!loadedRef.current) return;
    void window.simpleImage.core.settings.set(key, value);
  }, [key, value]);
}
