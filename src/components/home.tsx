import { useNavigation } from "../state/navigation";
import { homeToolOrder, toolMeta } from "../tools/tool-meta";

export function HomeView() {
  const { setCurrentTool } = useNavigation();

  return (
    <section class="tool-home">
      <div class="tool-home-hero">
        <strong>图像资产工具集合</strong>
        <p>
          当前先交付稳定的图片压缩工具，后续会在同一套本地工作台里继续扩展图集打包、增量打包与图集拆分能力。
        </p>
      </div>
      <div class="tool-card-grid">
        {homeToolOrder.map((tool) => {
          const meta = toolMeta[tool];
          const isAvailable = meta.status === "available";
          return (
            <article key={tool} class={`tool-card ${isAvailable ? "is-available" : ""}`}>
              <div class="tool-card-head">
                <strong>{meta.label}</strong>
                <em>{isAvailable ? "已可用" : "规划中"}</em>
              </div>
              <p>{meta.description}</p>
              <button
                class="tool-card-action"
                disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) {
                    setCurrentTool(tool);
                  }
                }}
              >
                {isAvailable ? "进入工具" : "暂未开放"}
              </button>
            </article>
          );
        })}
      </div>
      <div class="tool-roadmap">
        <strong>当前建议的演进顺序</strong>
        <ol>
          <li>把图片压缩工具补到稳定可替代。</li>
          <li>抽出通用任务栏、文件导入区、结果列表。</li>
          <li>在同一工作台内接入图集打包与增量打包。</li>
          <li>补图集拆分和发布级流程。</li>
        </ol>
      </div>
    </section>
  );
}
