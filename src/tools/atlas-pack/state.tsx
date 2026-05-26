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
import { useRemembered } from "../../shared/use-remembered";
import {
  ATLAS_PRESET_SENSITIVE_KEYS,
  atlasPresetMap,
  type AtlasPresetKey,
} from "./presets";
import type {
  AtlasExportResult,
  AtlasInput,
  AtlasMetadataFormat,
  AtlasPackResult,
  InputFile,
  TaskProgress,
} from "../../shared/types";

export type AtlasPackState = {
  inputs: AtlasInput[];
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotate: boolean;
  pot: boolean;
  trim: boolean;
  format: AtlasMetadataFormat;
  outputDir: string;
  outputName: string;
  preset: AtlasPresetKey;
  packResult: AtlasPackResult | null;
  packing: boolean;
  exporting: boolean;
  lastError: string;
  lastExport: AtlasExportResult | null;
  progress: TaskProgress | null;
};

const initialState: AtlasPackState = {
  inputs: [],
  maxWidth: 2048,
  maxHeight: 2048,
  padding: 2,
  allowRotate: false,
  pot: false,
  trim: true,
  format: "json-hash",
  outputDir: "",
  outputName: "atlas",
  preset: "default",
  packResult: null,
  packing: false,
  exporting: false,
  lastError: "",
  lastExport: null,
  progress: null,
};

type Action =
  | { type: "patch"; payload: Partial<AtlasPackState> }
  | { type: "import"; payload: InputFile[] }
  | { type: "clear" }
  | { type: "apply-preset"; payload: Exclude<AtlasPresetKey, "custom"> };

function patchTouchesPresetParams(payload: Partial<AtlasPackState>): boolean {
  return ATLAS_PRESET_SENSITIVE_KEYS.some((key) => key in payload);
}

function reducer(state: AtlasPackState, action: Action): AtlasPackState {
  switch (action.type) {
    case "patch": {
      // 用户改任何 preset 参数 → 自动切 custom（除非显式带 preset）
      if (patchTouchesPresetParams(action.payload) && !("preset" in action.payload)) {
        return { ...state, ...action.payload, preset: "custom" };
      }
      return { ...state, ...action.payload };
    }
    case "import": {
      // 用 path 去重，保留已有，追加新增
      const map = new Map(state.inputs.map((i) => [i.path, i]));
      for (const file of action.payload) {
        if (!file.supported) continue;
        if (file.ext === ".svg") continue; // 图集打包不处理 SVG
        if (!map.has(file.path)) {
          map.set(file.path, { path: file.path, name: file.name });
        }
      }
      const merged = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { ...state, inputs: merged, packResult: null, lastError: "" };
    }
    case "clear":
      return { ...state, inputs: [], packResult: null, lastError: "" };
    case "apply-preset": {
      const preset = atlasPresetMap.get(action.payload);
      if (!preset) return state;
      return { ...state, ...preset.params, preset: preset.key };
    }
  }
}

export type AtlasPackContextValue = {
  state: AtlasPackState;
  patch: (payload: Partial<AtlasPackState>) => void;
  importInputs: (files: InputFile[]) => void;
  clearSession: () => void;
  exportAtlas: () => Promise<void>;
  applyPreset: (key: Exclude<AtlasPresetKey, "custom">) => void;
};

const AtlasPackContext = createContext<AtlasPackContextValue | null>(null);

// 影响打包结果的字段，变化时触发自动重新 pack（防抖）
const PACK_TRIGGER_KEYS: ReadonlyArray<keyof AtlasPackState> = [
  "inputs",
  "maxWidth",
  "maxHeight",
  "padding",
  "allowRotate",
  "pot",
  "trim",
];

export function AtlasPackProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 订阅主进程导出进度
  useEffect(() => {
    const unsub = window.simpleImage.tools.atlasPack.onProgress((p) => {
      dispatch({ type: "patch", payload: { progress: p } });
    });
    return unsub;
  }, []);

  // 记忆输出目录
  useRemembered("tool:atlas-pack:outputDir", state.outputDir, (saved) => {
    dispatch({ type: "patch", payload: { outputDir: saved } });
  });

  const patch = useCallback((payload: Partial<AtlasPackState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const importInputs = useCallback((files: InputFile[]) => {
    dispatch({ type: "import", payload: files });
  }, []);

  const clearSession = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  // 防抖自动 pack：依赖字段变化 300ms 后触发
  useEffect(() => {
    if (state.inputs.length === 0) {
      if (state.packResult !== null) {
        dispatch({ type: "patch", payload: { packResult: null } });
      }
      return;
    }

    let cancelled = false;
    dispatch({ type: "patch", payload: { packing: true } });
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.simpleImage.tools.atlasPack.pack({
          inputs: state.inputs,
          maxWidth: state.maxWidth,
          maxHeight: state.maxHeight,
          padding: state.padding,
          allowRotate: state.allowRotate,
          pot: state.pot,
          trim: state.trim,
        });
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: { packResult: result, packing: false, lastError: "" },
          });
        }
      } catch (e) {
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: {
              packing: false,
              lastError: e instanceof Error ? e.message : String(e),
            },
          });
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, PACK_TRIGGER_KEYS.map((k) => state[k]));

  const exportAtlas = useCallback(async () => {
    const current = stateRef.current;
    if (current.exporting || current.inputs.length === 0 || !current.outputDir) {
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
      const result = await window.simpleImage.tools.atlasPack.export({
        inputs: current.inputs,
        maxWidth: current.maxWidth,
        maxHeight: current.maxHeight,
        padding: current.padding,
        allowRotate: current.allowRotate,
        pot: current.pot,
        trim: current.trim,
        outputDir: current.outputDir,
        outputName: current.outputName,
        format: current.format,
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

  const applyPreset = useCallback((key: Exclude<AtlasPresetKey, "custom">) => {
    dispatch({ type: "apply-preset", payload: key });
  }, []);

  const value = useMemo<AtlasPackContextValue>(
    () => ({ state, patch, importInputs, clearSession, exportAtlas, applyPreset }),
    [state, patch, importInputs, clearSession, exportAtlas, applyPreset],
  );

  return (
    <AtlasPackContext.Provider value={value}>{children}</AtlasPackContext.Provider>
  );
}

export function useAtlasPack(): AtlasPackContextValue {
  const ctx = useContext(AtlasPackContext);
  if (!ctx) throw new Error("useAtlasPack must be inside AtlasPackProvider");
  return ctx;
}
