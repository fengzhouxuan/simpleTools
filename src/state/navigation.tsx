import { createContext } from "preact";
import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ToolKey } from "../shared/types";

type NavigationValue = {
  currentTool: ToolKey;
  setCurrentTool: (tool: ToolKey) => void;
};

const NavigationContext = createContext<NavigationValue | null>(null);

export function NavigationProvider({ children }: { children: ComponentChildren }) {
  const [currentTool, setCurrentTool] = useState<ToolKey>("home");
  const value = useMemo(() => ({ currentTool, setCurrentTool }), [currentTool]);

  // 监听主进程菜单触发的导航（Cmd+1~6 快捷键 / 工具菜单点击）
  useEffect(() => {
    const unsub = window.simpleImage.onNavigate((tool) => {
      setCurrentTool(tool);
    });
    return unsub;
  }, []);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return value;
}
