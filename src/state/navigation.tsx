import { createContext } from "preact";
import { useContext, useMemo, useState } from "preact/hooks";
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
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return value;
}
