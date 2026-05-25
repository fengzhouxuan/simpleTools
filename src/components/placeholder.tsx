import { useNavigation } from "../state/navigation";
import { toolMeta } from "../tools/tool-meta";
import type { ToolKey } from "../shared/types";

type PlaceholderProps = {
  tool: ToolKey;
};

export function Placeholder({ tool }: PlaceholderProps) {
  const meta = toolMeta[tool];
  return (
    <section class="tool-placeholder">
      <strong>{meta.label}</strong>
      <p>{meta.description}</p>
      <div class="placeholder-note">
        <span>当前阶段</span>
        <em>规划中</em>
      </div>
      <ul>
        <li>先完成工具首页与模块边界。</li>
        <li>再抽象通用任务流与文件输入输出能力。</li>
        <li>最后接入该工具的具体资源处理逻辑。</li>
      </ul>
      <BackToCompress />
    </section>
  );
}

function BackToCompress() {
  const { setCurrentTool } = useNavigation();
  return (
    <button class="tool-card-action" onClick={() => setCurrentTool("compress")}>
      先回到图片压缩
    </button>
  );
}
