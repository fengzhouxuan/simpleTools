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
import type {
  IconExportTarget,
  IconGenResult,
  TaskProgress,
} from "../../shared/types";
import { useRemembered } from "../../shared/use-remembered";

export type IconGenState = {
  sourcePath: string;
  outputDir: string;
  outputName: string;
  targets: IconExportTarget[];
  running: boolean;
  lastError: string;
  lastResult: IconGenResult | null;
  progress: TaskProgress | null;
};

const initialState: IconGenState = {
  sourcePath: "",
  outputDir: "",
  outputName: "icon",
  targets: ["macos-icns", "favicon"],
  running: false,
  lastError: "",
  lastResult: null,
  progress: null,
};

type Action =
  | { type: "patch"; payload: Partial<IconGenState> }
  | { type: "toggle-target"; payload: IconExportTarget }
  | { type: "clear" };

function reducer(state: IconGenState, action: Action): IconGenState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "toggle-target": {
      const set = new Set(state.targets);
      if (set.has(action.payload)) set.delete(action.payload);
      else set.add(action.payload);
      return { ...state, targets: Array.from(set) };
    }
    case "clear":
      return initialState;
  }
}

export type IconGenContextValue = {
  state: IconGenState;
  patch: (payload: Partial<IconGenState>) => void;
  toggleTarget: (target: IconExportTarget) => void;
  clearSession: () => void;
  runGenerate: () => Promise<void>;
};

const Ctx = createContext<IconGenContextValue | null>(null);

export function IconGenProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 订阅主进程进度推送
  useEffect(() => {
    const unsub = window.simpleImage.tools.iconGen.onProgress((p) => {
      dispatch({ type: "patch", payload: { progress: p } });
    });
    return unsub;
  }, []);

  // 记忆输出目录
  useRemembered("tool:icon-gen:outputDir", state.outputDir, (saved) => {
    dispatch({ type: "patch", payload: { outputDir: saved } });
  });

  const patch = useCallback((payload: Partial<IconGenState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const toggleTarget = useCallback((target: IconExportTarget) => {
    dispatch({ type: "toggle-target", payload: target });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  const runGenerate = useCallback(async () => {
    const c = stateRef.current;
    if (
      c.running ||
      !c.sourcePath ||
      !c.outputDir ||
      c.targets.length === 0
    ) {
      return;
    }
    dispatch({
      type: "patch",
      payload: { running: true, lastError: "", lastResult: null, progress: null },
    });
    try {
      const result = await window.simpleImage.tools.iconGen.run({
        sourcePath: c.sourcePath,
        outputDir: c.outputDir,
        outputName: c.outputName,
        targets: c.targets,
      });
      dispatch({
        type: "patch",
        payload: { running: false, lastResult: result, progress: null },
      });
    } catch (e) {
      dispatch({
        type: "patch",
        payload: {
          running: false,
          progress: null,
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }, []);

  const value = useMemo<IconGenContextValue>(
    () => ({ state, patch, toggleTarget, clearSession, runGenerate }),
    [state, patch, toggleTarget, clearSession, runGenerate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIconGen(): IconGenContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useIconGen must be inside IconGenProvider");
  return ctx;
}
