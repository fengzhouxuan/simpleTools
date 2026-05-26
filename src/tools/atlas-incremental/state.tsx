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
  InputFile,
} from "../../shared/types";

export type AtlasIncrementalState = {
  // 两种"旧版本"输入二选一
  manifestPath: string;          // A) 精确模式
  atlasPath: string;             // B) fallback 模式之一
  metadataPath: string;          // B) fallback 模式之二

  newSources: InputFile[];
  outputDir: string;
  outputName: string;
  format: AtlasMetadataFormat;
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotate: boolean;
  pot: boolean;
  trim: boolean;
  diff: AtlasIncrementalDiff | null;
  manifestInfo: { format: string; total: number; fallback: boolean } | null;
  inspecting: boolean;
  exporting: boolean;
  lastError: string;
  lastExport: AtlasIncrementalResult | null;
};

const initialState: AtlasIncrementalState = {
  manifestPath: "",
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
  manifestInfo: null,
  inspecting: false,
  exporting: false,
  lastError: "",
  lastExport: null,
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

  const patch = useCallback((payload: Partial<AtlasIncrementalState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const importSources = useCallback((files: InputFile[]) => {
    dispatch({ type: "import", payload: files });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  // 旧版输入齐 + 有新源时自动 inspect
  // 旧版输入：manifestPath（精确模式）或 atlasPath+metadataPath（fallback 模式）
  useEffect(() => {
    const hasManifest = !!state.manifestPath;
    const hasFallbackPair = !!state.atlasPath && !!state.metadataPath;
    if ((!hasManifest && !hasFallbackPair) || state.newSources.length === 0) {
      if (state.diff !== null) dispatch({ type: "patch", payload: { diff: null } });
      return;
    }
    let cancelled = false;
    dispatch({ type: "patch", payload: { inspecting: true, lastError: "" } });
    window.simpleImage.tools.atlasIncremental
      .inspect({
        manifestPath: state.manifestPath || undefined,
        atlasPath: state.atlasPath || undefined,
        metadataPath: state.metadataPath || undefined,
        newSourcePaths: state.newSources.map((s) => s.path),
      })
      .then(({ diff, manifest }) => {
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: { diff, manifestInfo: manifest, inspecting: false },
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: {
              inspecting: false,
              diff: null,
              lastError: e instanceof Error ? e.message : String(e),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.manifestPath, state.atlasPath, state.metadataPath, state.newSources]);

  const runExport = useCallback(async () => {
    const c = stateRef.current;
    const hasOldInput = !!c.manifestPath || (!!c.atlasPath && !!c.metadataPath);
    if (
      c.exporting ||
      !hasOldInput ||
      c.newSources.length === 0 ||
      !c.outputDir ||
      !c.diff
    ) {
      return;
    }
    dispatch({
      type: "patch",
      payload: { exporting: true, lastError: "", lastExport: null },
    });
    try {
      const result = await window.simpleImage.tools.atlasIncremental.export({
        manifestPath: c.manifestPath || undefined,
        atlasPath: c.atlasPath || undefined,
        metadataPath: c.metadataPath || undefined,
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
      dispatch({ type: "patch", payload: { exporting: false, lastExport: result } });
    } catch (e) {
      dispatch({
        type: "patch",
        payload: {
          exporting: false,
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
