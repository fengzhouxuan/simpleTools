import { useEffect } from "preact/hooks";
import { NavigationProvider } from "./state/navigation";
import { CompressProvider } from "./tools/compress/state";
import { AtlasPackProvider } from "./tools/atlas-pack/state";
import { AtlasUnpackProvider } from "./tools/atlas-unpack/state";
import { AtlasIncrementalProvider } from "./tools/atlas-incremental/state";
import { IconGenProvider } from "./tools/icon-gen/state";
import { ToolNav } from "./components/tool-nav";
import { Workspace } from "./components/workspace";
import { ThemeSwitcher } from "./components/theme-switcher";
import { ThemeProvider } from "./shared/theme";

export function App() {
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <ThemeProvider>
    <NavigationProvider>
      <CompressProvider>
        <AtlasPackProvider>
        <AtlasUnpackProvider>
        <AtlasIncrementalProvider>
        <IconGenProvider>
        <main class="tuya-shell">
          <header class="tuya-titlebar">
            <strong>SimpleImageCompress</strong>
            <ThemeSwitcher />
          </header>
          <div class="workspace-shell">
            <ToolNav />
            <section class="workspace-main">
              <Workspace />
            </section>
          </div>
        </main>
        </IconGenProvider>
        </AtlasIncrementalProvider>
        </AtlasUnpackProvider>
        </AtlasPackProvider>
      </CompressProvider>
    </NavigationProvider>
    </ThemeProvider>
  );
}
