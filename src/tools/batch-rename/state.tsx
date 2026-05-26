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
  BatchRenameMode,
  BatchRenamePlanItem,
  BatchRenameResult,
  BatchRenameRules,
  InputFile,
  TaskProgress,
} from "../../shared/types";
import { useRemembered } from "../../shared/use-remembered";

export type BatchRenameState = {
  files: InputFile[];
  rules: BatchRenameRules;
  mode: BatchRenameMode;
  outputDir: string;
  plan: BatchRenamePlanItem[] | null;
  computing: boolean;
  running: boolean;
  lastError: string;
  lastResult: BatchRenameResult | null;
  progress: TaskProgress | null;
};

const initialRules: BatchRenameRules = {
  prefix: "",
  suffix: "",
  sequence: { enabled: false, start: 1, digits: 3, insertAt: "prefix" },
  regex: { enabled: false, pattern: "", flags: "g", replacement: "" },
};

const initialState: BatchRenameState = {
  files: [],
  rules: initialRules,
  mode: "in-place",
  outputDir: "",
  plan: null,
  computing: false,
  running: false,
  lastError: "",
  lastResult: null,
  progress: null,
};

type Action =
  | { type: "patch"; payload: Partial<BatchRenameState> }
  | { type: "patch-rules"; payload: Partial<BatchRenameRules> }
  | { type: "import"; payload: InputFile[] }
  | { type: "clear" };

function reducer(state: BatchRenameState, action: Action): BatchRenameState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "patch-rules":
      return { ...state, rules: { ...state.rules, ...action.payload }, plan: null };
    case "import": {
      const map = new Map(state.files.map((f) => [f.path, f]));
      for (const f of action.payload) {
        if (!map.has(f.path)) map.set(f.path, f);
      }
      const merged = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { ...state, files: merged, plan: null, lastError: "" };
    }
    case "clear":
      return initialState;
  }
}

export type BatchRenameContextValue = {
  state: BatchRenameState;
  patch: (payload: Partial<BatchRenameState>) => void;
  patchRules: (payload: Partial<BatchRenameRules>) => void;
  importFiles: (files: InputFile[]) => void;
  clearSession: () => void;
  execute: () => Promise<void>;
};

const Ctx = createContext<BatchRenameContextValue | null>(null);

export function BatchRenameProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 进度订阅
  useEffect(() => {
    const unsub = window.simpleImage.tools.batchRename.onProgress((p) => {
      dispatch({ type: "patch", payload: { progress: p } });
    });
    return unsub;
  }, []);

  // 输出目录记忆
  useRemembered("tool:batch-rename:outputDir", state.outputDir, (saved) => {
    dispatch({ type: "patch", payload: { outputDir: saved } });
  });

  // 任意输入/规则变化触发 preview（350ms 防抖）
  useEffect(() => {
    if (state.files.length === 0) {
      if (state.plan !== null) dispatch({ type: "patch", payload: { plan: null } });
      return;
    }
    let cancelled = false;
    dispatch({ type: "patch", payload: { computing: true, lastError: "" } });
    const timer = window.setTimeout(() => {
      window.simpleImage.tools.batchRename
        .preview({
          files: state.files.map((f) => ({ path: f.path, name: f.name })),
          rules: state.rules,
          mode: state.mode,
          outputDir: state.outputDir,
        })
        .then((plan) => {
          if (!cancelled) {
            dispatch({ type: "patch", payload: { plan, computing: false } });
          }
        })
        .catch((e) => {
          if (!cancelled) {
            dispatch({
              type: "patch",
              payload: {
                computing: false,
                plan: null,
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
  }, [state.files, state.rules, state.mode, state.outputDir]);

  const patch = useCallback((payload: Partial<BatchRenameState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const patchRules = useCallback((payload: Partial<BatchRenameRules>) => {
    dispatch({ type: "patch-rules", payload });
  }, []);

  const importFiles = useCallback((files: InputFile[]) => {
    dispatch({ type: "import", payload: files });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  const execute = useCallback(async () => {
    const c = stateRef.current;
    if (c.running || c.files.length === 0 || !c.plan) return;
    if (c.mode === "copy-to-dir" && !c.outputDir) return;

    dispatch({
      type: "patch",
      payload: { running: true, lastError: "", lastResult: null, progress: null },
    });
    try {
      const result = await window.simpleImage.tools.batchRename.execute({
        files: c.files.map((f) => ({ path: f.path, name: f.name })),
        rules: c.rules,
        mode: c.mode,
        outputDir: c.outputDir,
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

  const value = useMemo<BatchRenameContextValue>(
    () => ({ state, patch, patchRules, importFiles, clearSession, execute }),
    [state, patch, patchRules, importFiles, clearSession, execute],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBatchRename(): BatchRenameContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBatchRename must be inside BatchRenameProvider");
  return v;
}
