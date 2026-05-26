import { createContext } from "preact";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "preact/hooks";
import type { ComponentChildren } from "preact";

export type ThemePref = "auto" | "light" | "dark";

type Value = {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
};

const Ctx = createContext<Value | null>(null);

const KEY = "ui:theme";

// 把 data-theme attr 写到 <html>，影响所有 [data-theme="x"] CSS 规则
function applyTheme(pref: ThemePref) {
  const html = document.documentElement;
  if (pref === "auto") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", pref);
  }
}

export function ThemeProvider({ children }: { children: ComponentChildren }) {
  const [pref, setPrefState] = useState<ThemePref>("auto");
  const [hydrated, setHydrated] = useState(false);

  // 启动：读 settings
  useEffect(() => {
    void window.simpleImage.core.settings
      .get<ThemePref | null>(KEY, null)
      .then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "auto") {
          setPrefState(saved);
          applyTheme(saved);
        }
        setHydrated(true);
      });
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    applyTheme(p);
    void window.simpleImage.core.settings.set(KEY, p);
  }, []);

  // hydrated 之前避免无谓写盘
  useEffect(() => {
    if (!hydrated) return;
    applyTheme(pref);
  }, [pref, hydrated]);

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be inside ThemeProvider");
  return v;
}
