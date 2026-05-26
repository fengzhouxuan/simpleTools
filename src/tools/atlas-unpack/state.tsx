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
import type { AtlasInspectResult, AtlasUnpackResult } from "../../shared/types";
import { useRemembered } from "../../shared/use-remembered";

export type AtlasUnpackState = {
  atlasPath: string;
  metadataPath: string;
  outputDir: string;
  restoreOriginalSize: boolean;
  inspect: AtlasInspectResult | null;
  inspecting: boolean;
  exporting: boolean;
  lastError: string;
  lastExport: AtlasUnpackResult | null;
};

const initialState: AtlasUnpackState = {
  atlasPath: "",
  metadataPath: "",
  outputDir: "",
  restoreOriginalSize: true,
  inspect: null,
  inspecting: false,
  exporting: false,
  lastError: "",
  lastExport: null,
};

type Action =
  | { type: "patch"; payload: Partial<AtlasUnpackState> }
  | { type: "clear" };

function reducer(state: AtlasUnpackState, action: Action): AtlasUnpackState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "clear":
      return initialState;
  }
}

export type AtlasUnpackContextValue = {
  state: AtlasUnpackState;
  patch: (payload: Partial<AtlasUnpackState>) => void;
  clearSession: () => void;
  exportUnpack: () => Promise<void>;
};

const AtlasUnpackContext = createContext<AtlasUnpackContextValue | null>(null);

export function AtlasUnpackProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patch = useCallback((payload: Partial<AtlasUnpackState>) => {
    dispatch({ type: "patch", payload });
  }, []);

  const clearSession = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  // atlasPath + metadataPath 都齐时自动 inspect
  useEffect(() => {
    if (!state.atlasPath || !state.metadataPath) {
      if (state.inspect !== null) {
        dispatch({ type: "patch", payload: { inspect: null } });
      }
      return;
    }
    let cancelled = false;
    dispatch({ type: "patch", payload: { inspecting: true, lastError: "" } });
    window.simpleImage.tools.atlasUnpack
      .inspect({
        atlasPath: state.atlasPath,
        metadataPath: state.metadataPath,
      })
      .then((result) => {
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: { inspect: result, inspecting: false },
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: {
              inspecting: false,
              inspect: null,
              lastError: e instanceof Error ? e.message : String(e),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.atlasPath, state.metadataPath]);

  const exportUnpack = useCallback(async () => {
    const current = stateRef.current;
    if (
      current.exporting ||
      !current.atlasPath ||
      !current.metadataPath ||
      !current.outputDir ||
      !current.inspect
    ) {
      return;
    }
    dispatch({
      type: "patch",
      payload: { exporting: true, lastError: "", lastExport: null },
    });
    try {
      const result = await window.simpleImage.tools.atlasUnpack.export({
        atlasPath: current.atlasPath,
        metadataPath: current.metadataPath,
        outputDir: current.outputDir,
        restoreOriginalSize: current.restoreOriginalSize,
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

  // 记忆输出目录
  useRemembered("tool:atlas-unpack:outputDir", state.outputDir, (saved) => {
    dispatch({ type: "patch", payload: { outputDir: saved } });
  });

  const value = useMemo<AtlasUnpackContextValue>(
    () => ({ state, patch, clearSession, exportUnpack }),
    [state, patch, clearSession, exportUnpack],
  );

  return (
    <AtlasUnpackContext.Provider value={value}>
      {children}
    </AtlasUnpackContext.Provider>
  );
}

export function useAtlasUnpack(): AtlasUnpackContextValue {
  const ctx = useContext(AtlasUnpackContext);
  if (!ctx) throw new Error("useAtlasUnpack must be inside AtlasUnpackProvider");
  return ctx;
}
