import { useNavigation } from "../state/navigation";
import { navToolOrder, toolMeta } from "../tools/tool-meta";

export function ToolNav() {
  const { currentTool, setCurrentTool } = useNavigation();

  return (
    <aside class="tool-nav">
      <div class="tool-nav-head">
        <strong>工具集合</strong>
        <span>本地离线工作台</span>
      </div>
      <div class="tool-nav-list">
        {navToolOrder.map((tool) => (
          <button
            key={tool}
            class={`tool-nav-item ${currentTool === tool ? "is-active" : ""}`}
            onClick={() => {
              if (tool !== currentTool) {
                setCurrentTool(tool);
              }
            }}
          >
            <strong>{toolMeta[tool].label}</strong>
            <span>{toolMeta[tool].description}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
