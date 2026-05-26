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
  AtlasIncrementalDiff,
  AtlasIncrementalResult,
  AtlasMetadataFormat,
  AtlasPackResult,
  InputFile,
  TaskProgress,
} from "../../shared/types";

export type AtlasIncrementalState = {
  // 旧 atlas + 旧元数据（两个都必填）
  atlasPath: string;
  metadataPath: string;

  // 要新增/修改的散图（不是完整集合，只是想"加进去"的）
  newSources: InputFile[];

  outputDir: string;
  outputName: string;
  format: AtlasMetadataFormat;

  // 重打参数
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotate: boolean;
  pot: boolean;
  trim: boolean;

  diff: AtlasIncrementalDiff | null;
  packResult: AtlasPackResult | null;
  manifestInfo: { format: string; total: number } | null;
  previewing: boolean;
  exporting: boolean;
  lastError: string;
  lastExport: AtlasIncrementalResult | null;
  progress: TaskProgress | null;
};

const initialState: AtlasIncrementalState = {
  atlasPath: "",
  metadataPath: "",
  newSources: [],
  outputDir: "",
  outputName: "atlas",
  format: "json-hash",
  maxWidth: 2048,
  maxHeight: 2048,
  padding: 2,
  allowRotate: false,
  pot: false,
  trim: true,
  diff: null,
  packResult: null,
  manifestInfo: null,
  previewing: false,
  exporting: false,
  lastError: "",
  lastExport: null,
  progress: null,
};

type Action =
  | { type: "patch"; payload: Partial<AtlasIncrementalState> }
  | { type: "import"; payload: InputFile[] }
  | { type: "clear" };

function reducer(
  state: AtlasIncrementalState,
  action: Action,
): AtlasIncrementalState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "import": {
      const map = new Map(state.newSources.map((i) => [i.path, i]));
      for (const f of action.payload) {
        if (!f.supported) continue;
        if (f.ext === ".svg") continue;
        if (!map.has(f.path)) map.set(f.path, f);
      }
      const merged = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { ...state, newSources: merged, diff: null, lastError: "" };
    }
    case "clear":
      return initialState;
  }
}

export type AtlasIncrementalContextValue = {
  state: AtlasIncrementalState;
  patch: (payload: Partial<AtlasIncrementalState>) => void;
  importSources: (files: InputFile[]) => void;
  clearSession: () => void;
  runExport: () => Promise<void>;
};

const Ctx = createContext<AtlasIncrementalContextValue | null>(null);

export function AtlasIncrementalProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 订阅主进程导出进度
  useEffect(() => {
    const unsub = window.simpleImage.tools.atlasIncremental.onProgress((p) => {
      dispatch({ type: "patch", payload: { progress: p } });
    });
    return unsub;
  }, []);

  const patch = useCallback((payload: Partial<AtlasIncrementalState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const importSources = useCallback((files: InputFile[]) => {
    dispatch({ type: "import", payload: files });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  // 输入齐 / 参数变化时触发 preview（带 300ms 防抖）
  // 主进程对"拆图"有缓存，参数变化只重跑 pack 不重新拆图
  useEffect(() => {
    if (!state.atlasPath || !state.metadataPath) {
      if (state.diff !== null || state.packResult !== null) {
        dispatch({ type: "patch", payload: { diff: null, packResult: null } });
      }
      return;
    }
    let cancelled = false;
    dispatch({ type: "patch", payload: { previewing: true, lastError: "" } });
    const timer = window.setTimeout(() => {
      window.simpleImage.tools.atlasIncremental
        .preview({
          atlasPath: state.atlasPath,
          metadataPath: state.metadataPath,
          newSourcePaths: state.newSources.map((s) => s.path),
          maxWidth: state.maxWidth,
          maxHeight: state.maxHeight,
          padding: state.padding,
          allowRotate: state.allowRotate,
          pot: state.pot,
          trim: state.trim,
        })
        .then(({ diff, packResult, manifest }) => {
          if (!cancelled) {
            dispatch({
              type: "patch",
              payload: {
                diff,
                packResult,
                manifestInfo: manifest,
                previewing: false,
              },
            });
          }
        })
        .catch((e) => {
          if (!cancelled) {
            dispatch({
              type: "patch",
              payload: {
                previewing: false,
                diff: null,
                packResult: null,
                lastError: e instanceof Error ? e.message : String(e),
              },
            });
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    state.atlasPath,
    state.metadataPath,
    state.newSources,
    state.maxWidth,
    state.maxHeight,
    state.padding,
    state.allowRotate,
    state.pot,
    state.trim,
  ]);

  const runExport = useCallback(async () => {
    const c = stateRef.current;
    if (
      c.exporting ||
      !c.atlasPath ||
      !c.metadataPath ||
      !c.outputDir ||
      !c.diff
    ) {
      return;
    }
    dispatch({
      type: "patch",
      payload: {
        exporting: true,
        lastError: "",
        lastExport: null,
        progress: null,
      },
    });
    try {
      const result = await window.simpleImage.tools.atlasIncremental.export({
        atlasPath: c.atlasPath,
        metadataPath: c.metadataPath,
        newSourcePaths: c.newSources.map((s) => s.path),
        outputDir: c.outputDir,
        outputName: c.outputName,
        format: c.format,
        maxWidth: c.maxWidth,
        maxHeight: c.maxHeight,
        padding: c.padding,
        allowRotate: c.allowRotate,
        pot: c.pot,
        trim: c.trim,
      });
      dispatch({
        type: "patch",
        payload: { exporting: false, lastExport: result, progress: null },
      });
    } catch (e) {
      dispatch({
        type: "patch",
        payload: {
          exporting: false,
          progress: null,
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }, []);

  const value = useMemo<AtlasIncrementalContextValue>(
    () => ({ state, patch, importSources, clearSession, runExport }),
    [state, patch, importSources, clearSession, runExport],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAtlasIncremental(): AtlasIncrementalContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAtlasIncremental must be inside Provider");
  return ctx;
}
