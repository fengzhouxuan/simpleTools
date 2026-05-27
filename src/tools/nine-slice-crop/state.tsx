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
  NineSliceAnalyzeResult,
  NineSliceCenterStrategy,
  NineSliceCropResult,
  NineSliceInsets,
} from "../../shared/types";
import { useRemembered } from "../../shared/use-remembered";

// 渲染层状态：原图信息 + 4 个 inset + center keep + 当前预览模式
// 分析结果（输出尺寸 / 节省比 / 还原误差 + diff dataUri）通过 analyze 拿，
// state 缓存最近一次结果用于面板显示

export type SourceImageMeta = {
  path: string;
  name: string;
  width: number;
  height: number;
};

export type PreviewMode = "original" | "restored" | "diff";

export type NineSliceCropState = {
  source: SourceImageMeta | null;
  insets: NineSliceInsets;
  centerKeep: { x: number; y: number };
  center: NineSliceCenterStrategy;
  outputDir: string;
  outputName: string;
  previewMode: PreviewMode;
  analyzing: boolean;
  analysis: NineSliceAnalyzeResult | null;
  analysisError: string;
  exporting: boolean;
  exportResult: NineSliceCropResult | null;
  exportError: string;
};

const initialState: NineSliceCropState = {
  source: null,
  insets: { l: 0, t: 0, r: 0, b: 0 },
  // 默认 0：4 角直接拼接，小图视觉无缝（imageslicer 风格）
  // 提到 1+ 可显式保留中心代表像素，但小图直接看会有 1px 缝隙
  centerKeep: { x: 0, y: 0 },
  center: "stretch",
  outputDir: "",
  outputName: "",
  previewMode: "restored",
  analyzing: false,
  analysis: null,
  analysisError: "",
  exporting: false,
  exportResult: null,
  exportError: "",
};

type Action =
  | { type: "patch"; payload: Partial<NineSliceCropState> }
  | { type: "patch-insets"; payload: Partial<NineSliceInsets> }
  | { type: "load-source"; payload: SourceImageMeta }
  | { type: "clear" };

function reducer(
  state: NineSliceCropState,
  action: Action,
): NineSliceCropState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "patch-insets":
      // 改 inset 会让上次的 analysis 过期，清掉避免误导
      return {
        ...state,
        insets: { ...state.insets, ...action.payload },
        analysis: null,
        exportResult: null,
      };
    case "load-source": {
      // 新图：重置 inset 到 0，按图尺寸推荐默认 outputName
      const stem = action.payload.name.replace(/\.[^.]+$/, "");
      return {
        ...initialState,
        source: action.payload,
        outputDir: state.outputDir, // 保留上次的输出目录
        outputName: `${stem}.9`,
      };
    }
    case "clear":
      return { ...initialState, outputDir: state.outputDir };
  }
}

export type NineSliceCropContextValue = {
  state: NineSliceCropState;
  patch: (payload: Partial<NineSliceCropState>) => void;
  patchInsets: (payload: Partial<NineSliceInsets>) => void;
  loadSource: (payload: SourceImageMeta) => void;
  clearSession: () => void;
  exportCrop: () => Promise<void>;
};

const Ctx = createContext<NineSliceCropContextValue | null>(null);

export function NineSliceCropProvider({
  children,
}: {
  children: ComponentChildren;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 输出目录记忆
  useRemembered(
    "tool:nine-slice-crop:outputDir",
    state.outputDir,
    (saved) => {
      dispatch({ type: "patch", payload: { outputDir: saved } });
    },
  );

  // 任意 inset / centerKeep 变化触发 analyze（350ms 防抖）
  // 退化情况（4 个 inset 都 = 0）不分析
  useEffect(() => {
    if (!state.source) return;
    const sumInset =
      state.insets.l + state.insets.t + state.insets.r + state.insets.b;
    if (sumInset === 0) {
      // 没设任何切分点，分析没意义
      if (state.analysis !== null) {
        dispatch({ type: "patch", payload: { analysis: null } });
      }
      return;
    }
    let cancelled = false;
    dispatch({
      type: "patch",
      payload: { analyzing: true, analysisError: "" },
    });
    const timer = window.setTimeout(() => {
      window.simpleImage.tools.nineSliceCrop
        .analyze({
          sourcePath: state.source!.path,
          insets: state.insets,
          centerKeep: state.centerKeep,
        })
        .then((result) => {
          if (!cancelled) {
            dispatch({
              type: "patch",
              payload: { analyzing: false, analysis: result },
            });
          }
        })
        .catch((e) => {
          if (!cancelled) {
            dispatch({
              type: "patch",
              payload: {
                analyzing: false,
                analysis: null,
                analysisError: e instanceof Error ? e.message : String(e),
              },
            });
          }
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    state.source,
    state.insets.l,
    state.insets.t,
    state.insets.r,
    state.insets.b,
    state.centerKeep.x,
    state.centerKeep.y,
  ]);

  const patch = useCallback((payload: Partial<NineSliceCropState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const patchInsets = useCallback((payload: Partial<NineSliceInsets>) => {
    dispatch({ type: "patch-insets", payload });
  }, []);

  const loadSource = useCallback((payload: SourceImageMeta) => {
    dispatch({ type: "load-source", payload });
  }, []);

  const clearSession = useCallback(() => dispatch({ type: "clear" }), []);

  const exportCrop = useCallback(async () => {
    const c = stateRef.current;
    if (!c.source || c.exporting) return;
    if (!c.outputDir || !c.outputName) return;
    const sumInset = c.insets.l + c.insets.t + c.insets.r + c.insets.b;
    if (sumInset === 0) return;

    dispatch({
      type: "patch",
      payload: { exporting: true, exportError: "", exportResult: null },
    });
    try {
      const result = await window.simpleImage.tools.nineSliceCrop.export({
        sourcePath: c.source.path,
        insets: c.insets,
        centerKeep: c.centerKeep,
        center: c.center,
        outputDir: c.outputDir,
        outputName: c.outputName,
      });
      dispatch({
        type: "patch",
        payload: { exporting: false, exportResult: result },
      });
    } catch (e) {
      dispatch({
        type: "patch",
        payload: {
          exporting: false,
          exportError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }, []);

  const value = useMemo<NineSliceCropContextValue>(
    () => ({
      state,
      patch,
      patchInsets,
      loadSource,
      clearSession,
      exportCrop,
    }),
    [state, patch, patchInsets, loadSource, clearSession, exportCrop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNineSliceCrop(): NineSliceCropContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useNineSliceCrop must be used within NineSliceCropProvider",
    );
  }
  return v;
}
