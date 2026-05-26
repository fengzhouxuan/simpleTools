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
  CompressionMode,
  CompressionResult,
  InputFile,
  OutputFormat,
  PresetKey,
  ResizeMode,
  SaveMode,
  TaskProgress,
} from "../../shared/types";
import { PRESET_SENSITIVE_KEYS, presetMap } from "./presets";

export type CompressState = {
  files: InputFile[];
  outputDir: string;
  quality: number;
  targetSizeKB: number;
  resizeWidth: string;
  resizeHeight: string;
  preserveAspect: boolean;
  resizeMode: ResizeMode;
  mode: CompressionMode;
  outputFormat: OutputFormat;
  saveMode: SaveMode;
  preset: PresetKey;
  results: CompressionResult[];
  running: boolean;
  showAdvanced: boolean;
  progress: TaskProgress | null;
};

const initialState: CompressState = {
  files: [],
  outputDir: "",
  // 参数与默认 preset (archive) 对齐：保留原格式，对任意类型都安全
  quality: 92,
  targetSizeKB: 300,
  resizeWidth: "",
  resizeHeight: "",
  preserveAspect: true,
  resizeMode: "crop",
  mode: "quality",
  outputFormat: "original",
  saveMode: "source",
  preset: "archive",
  results: [],
  running: false,
  showAdvanced: true,
  progress: null,
};

type Action =
  | { type: "patch"; payload: Partial<CompressState> }
  | { type: "import"; payload: InputFile[] }
  | { type: "clear" }
  | { type: "replace-result"; payload: CompressionResult }
  | { type: "apply-preset"; payload: Exclude<PresetKey, "custom"> };

function patchTouchesPresetParams(payload: Partial<CompressState>): boolean {
  return PRESET_SENSITIVE_KEYS.some((key) => key in payload);
}

function reducer(state: CompressState, action: Action): CompressState {
  switch (action.type) {
    case "patch": {
      // 用户调任何 preset 参数 → 自动切到 custom（除非显式带 preset）
      if (patchTouchesPresetParams(action.payload) && !("preset" in action.payload)) {
        return { ...state, ...action.payload, preset: "custom" };
      }
      return { ...state, ...action.payload };
    }
    case "import": {
      const fileMap = new Map(state.files.map((file) => [file.path, file]));
      for (const file of action.payload) {
        if (file.supported) {
          fileMap.set(file.path, file);
        }
      }
      const merged = Array.from(fileMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { ...state, files: merged, results: [] };
    }
    case "clear":
      return {
        ...state,
        files: [],
        results: [],
      };
    case "replace-result": {
      const next = action.payload;
      const results = state.results.map((r) => (r.path === next.path ? next : r));
      return { ...state, results };
    }
    case "apply-preset": {
      const preset = presetMap.get(action.payload);
      if (!preset) return state;
      return { ...state, ...preset.params, preset: preset.key };
    }
  }
}

export type CompressContextValue = {
  state: CompressState;
  patch: (payload: Partial<CompressState>) => void;
  importFiles: (incoming: InputFile[]) => void;
  clearSession: () => void;
  runCompression: () => Promise<void>;
  retryItem: (file: InputFile) => Promise<void>;
  setQualityFromLevel: (level: number) => void;
  applyPreset: (key: Exclude<PresetKey, "custom">) => void;
};

const CompressContext = createContext<CompressContextValue | null>(null);

export function CompressProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 订阅主进程的进度推送
  useEffect(() => {
    const unsub = window.simpleImage.tools.compress.onProgress((p) => {
      dispatch({ type: "patch", payload: { progress: p } });
    });
    return unsub;
  }, []);

  const patch = useCallback((payload: Partial<CompressState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const importFiles = useCallback((incoming: InputFile[]) => {
    dispatch({ type: "import", payload: incoming });
  }, []);

  const clearSession = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  const setQualityFromLevel = useCallback((level: number) => {
    const nextQuality = Math.round(40 + ((level - 1) / 9) * 55);
    dispatch({
      type: "patch",
      payload: { quality: Math.max(40, Math.min(95, nextQuality)) },
    });
  }, []);

  const buildPayload = useCallback((files: InputFile[]) => {
    const current = stateRef.current;
    return {
      files,
      outputDir: current.outputDir,
      quality: current.quality,
      mode: current.mode,
      targetSizeKB: current.targetSizeKB,
      outputFormat: current.outputFormat,
      saveMode: current.saveMode,
      resizeOptions: {
        width: Number(current.resizeWidth) || undefined,
        height: Number(current.resizeHeight) || undefined,
        preserveAspect: current.preserveAspect,
        resizeMode: current.resizeMode,
      },
    };
  }, []);

  const runCompression = useCallback(async () => {
    const current = stateRef.current;
    if (
      current.running ||
      current.files.length === 0 ||
      (current.saveMode === "custom" && !current.outputDir)
    ) {
      return;
    }

    dispatch({ type: "patch", payload: { running: true, progress: null } });

    try {
      const results = await window.simpleImage.tools.compress.run(
        buildPayload(current.files),
      );
      dispatch({
        type: "patch",
        payload: { results, running: false, progress: null },
      });
    } catch (error) {
      dispatch({ type: "patch", payload: { running: false, progress: null } });
      throw error;
    }
  }, [buildPayload]);

  const retryItem = useCallback(
    async (file: InputFile) => {
      const current = stateRef.current;
      if (current.running) return;
      if (current.saveMode === "custom" && !current.outputDir) return;

      const [result] = await window.simpleImage.tools.compress.run(
        buildPayload([file]),
      );
      if (result) {
        dispatch({ type: "replace-result", payload: result });
      }
    },
    [buildPayload],
  );

  const applyPreset = useCallback((key: Exclude<PresetKey, "custom">) => {
    dispatch({ type: "apply-preset", payload: key });
  }, []);

  const value = useMemo<CompressContextValue>(
    () => ({
      state,
      patch,
      importFiles,
      clearSession,
      runCompression,
      retryItem,
      setQualityFromLevel,
      applyPreset,
    }),
    [state, patch, importFiles, clearSession, runCompression, retryItem, setQualityFromLevel, applyPreset],
  );

  return <CompressContext.Provider value={value}>{children}</CompressContext.Provider>;
}

export function useCompressState(): CompressContextValue {
  const value = useContext(CompressContext);
  if (!value) {
    throw new Error("useCompressState must be used within CompressProvider");
  }
  return value;
}

export function getQualityLevel(quality: number): number {
  const normalized = (quality - 40) / 55;
  return Math.min(10, Math.max(1, Math.round(normalized * 9 + 1)));
}
