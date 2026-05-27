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
  CompressionResult,
  InputFile,
  SaveMode,
  TaskProgress,
} from "../../shared/types";
import { useRemembered } from "../../shared/use-remembered";

// 仅支持 sharp 能读写的 5 种格式（与主进程 SUPPORTED_EXT 保持一致）
const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export type MetadataStripState = {
  files: InputFile[];
  outputDir: string;
  saveMode: SaveMode;
  preserveColorProfile: boolean;
  preserveOrientation: boolean;
  results: CompressionResult[];
  running: boolean;
  progress: TaskProgress | null;
};

const initialState: MetadataStripState = {
  files: [],
  outputDir: "",
  // 默认放原文件夹（与 compress 默认一致），不直接覆盖原文件，避免误删
  saveMode: "source",
  // 默认两项都保留 → 输出"安全": 颜色不偏、方向不翻
  // 用户要彻底剥离再去关
  preserveColorProfile: true,
  preserveOrientation: true,
  results: [],
  running: false,
  progress: null,
};

type Action =
  | { type: "patch"; payload: Partial<MetadataStripState> }
  | { type: "import"; payload: InputFile[] }
  | { type: "clear" }
  | { type: "replace-result"; payload: CompressionResult };

function reducer(
  state: MetadataStripState,
  action: Action,
): MetadataStripState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "import": {
      const map = new Map(state.files.map((f) => [f.path, f]));
      for (const f of action.payload) {
        const ext = f.ext.toLowerCase();
        // 仅接收支持的扩展名 — 与 compress 一致：默默忽略不支持的
        if (SUPPORTED.has(ext)) {
          map.set(f.path, { ...f, supported: true });
        }
      }
      const merged = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { ...state, files: merged, results: [] };
    }
    case "clear":
      return { ...state, files: [], results: [] };
    case "replace-result": {
      const next = action.payload;
      const results = state.results.map((r) =>
        r.path === next.path ? next : r,
      );
      return { ...state, results };
    }
  }
}

export type MetadataStripContextValue = {
  state: MetadataStripState;
  patch: (payload: Partial<MetadataStripState>) => void;
  importFiles: (files: InputFile[]) => void;
  clearSession: () => void;
  run: () => Promise<void>;
  retryItem: (file: InputFile) => Promise<void>;
};

const Ctx = createContext<MetadataStripContextValue | null>(null);

export function MetadataStripProvider({
  children,
}: {
  children: ComponentChildren;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 进度订阅
  useEffect(() => {
    const unsub = window.simpleImage.tools.metadataStrip.onProgress((p) => {
      dispatch({ type: "patch", payload: { progress: p } });
    });
    return unsub;
  }, []);

  // 输出目录记忆
  useRemembered("tool:metadata-strip:outputDir", state.outputDir, (saved) => {
    dispatch({ type: "patch", payload: { outputDir: saved } });
  });

  const patch = useCallback((payload: Partial<MetadataStripState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const importFiles = useCallback((files: InputFile[]) => {
    dispatch({ type: "import", payload: files });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  const buildPayload = useCallback((files: InputFile[]) => {
    const c = stateRef.current;
    return {
      files,
      outputDir: c.outputDir,
      saveMode: c.saveMode,
      preserveColorProfile: c.preserveColorProfile,
      preserveOrientation: c.preserveOrientation,
    };
  }, []);

  const run = useCallback(async () => {
    const c = stateRef.current;
    if (c.running || c.files.length === 0) return;
    if (c.saveMode === "custom" && !c.outputDir) return;

    dispatch({
      type: "patch",
      payload: { running: true, progress: null, results: [] },
    });
    try {
      const results = await window.simpleImage.tools.metadataStrip.run(
        buildPayload(c.files),
      );
      dispatch({
        type: "patch",
        payload: { running: false, progress: null, results },
      });
    } catch (e) {
      dispatch({ type: "patch", payload: { running: false, progress: null } });
      throw e;
    }
  }, [buildPayload]);

  const retryItem = useCallback(
    async (file: InputFile) => {
      const c = stateRef.current;
      if (c.running) return;
      if (c.saveMode === "custom" && !c.outputDir) return;
      const [result] = await window.simpleImage.tools.metadataStrip.run(
        buildPayload([file]),
      );
      if (result) {
        dispatch({ type: "replace-result", payload: result });
      }
    },
    [buildPayload],
  );

  const value = useMemo<MetadataStripContextValue>(
    () => ({ state, patch, importFiles, clearSession, run, retryItem }),
    [state, patch, importFiles, clearSession, run, retryItem],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMetadataStrip(): MetadataStripContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useMetadataStrip must be used within MetadataStripProvider");
  }
  return v;
}
