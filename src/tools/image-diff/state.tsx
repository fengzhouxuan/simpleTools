import { createContext } from "preact";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ImageDiffResult } from "../../shared/types";

export type ImageDiffState = {
  aPath: string;
  bPath: string;
  threshold: number;
  running: boolean;
  result: ImageDiffResult | null;
  lastError: string;
};

const initialState: ImageDiffState = {
  aPath: "",
  bPath: "",
  threshold: 5,
  running: false,
  result: null,
  lastError: "",
};

type Action =
  | { type: "patch"; payload: Partial<ImageDiffState> }
  | { type: "clear" };

function reducer(state: ImageDiffState, action: Action): ImageDiffState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "clear":
      return initialState;
  }
}

export type ImageDiffContextValue = {
  state: ImageDiffState;
  patch: (payload: Partial<ImageDiffState>) => void;
  clearSession: () => void;
  runDiff: () => Promise<void>;
};

const Ctx = createContext<ImageDiffContextValue | null>(null);

export function ImageDiffProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patch = useCallback((payload: Partial<ImageDiffState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  // a/b/threshold 都齐时自动跑 diff（带 350ms 防抖，避免拖动阈值时频繁跑）
  useEffect(() => {
    if (!state.aPath || !state.bPath) {
      if (state.result !== null) dispatch({ type: "patch", payload: { result: null } });
      return;
    }
    let cancelled = false;
    dispatch({ type: "patch", payload: { running: true, lastError: "" } });
    const timer = window.setTimeout(() => {
      window.simpleImage.tools.imageDiff
        .run({
          aPath: state.aPath,
          bPath: state.bPath,
          threshold: state.threshold,
        })
        .then((result) => {
          if (!cancelled) {
            dispatch({ type: "patch", payload: { result, running: false } });
          }
        })
        .catch((e) => {
          if (!cancelled) {
            dispatch({
              type: "patch",
              payload: {
                running: false,
                result: null,
                lastError: e instanceof Error ? e.message : String(e),
              },
            });
          }
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state.aPath, state.bPath, state.threshold]);

  const runDiff = useCallback(async () => {
    // a/b 已经触发自动 diff；这里给"重试"按钮用
    const c = stateRef.current;
    if (!c.aPath || !c.bPath || c.running) return;
    dispatch({ type: "patch", payload: { running: true, lastError: "" } });
    try {
      const result = await window.simpleImage.tools.imageDiff.run({
        aPath: c.aPath,
        bPath: c.bPath,
        threshold: c.threshold,
      });
      dispatch({ type: "patch", payload: { result, running: false } });
    } catch (e) {
      dispatch({
        type: "patch",
        payload: {
          running: false,
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }, []);

  const value = useMemo<ImageDiffContextValue>(
    () => ({ state, patch, clearSession, runDiff }),
    [state, patch, clearSession, runDiff],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImageDiff(): ImageDiffContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useImageDiff must be inside ImageDiffProvider");
  return v;
}
