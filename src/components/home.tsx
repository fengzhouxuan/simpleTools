import { useNavigation } from "../state/navigation";
import { homeToolOrder, toolMeta } from "../tools/tool-meta";
import type { ToolKey } from "../shared/types";

// 每个工具的具体能力点（dashboard 卡片用）
const TOOL_CAPABILITIES: Partial<Record<ToolKey, string[]>> = {
  compress: [
    "JPG / PNG / GIF / SVG 全支持",
    "4 个内置预设 + 自定义",
    "质量 / 目标体积 两种模式（GIF 二分查找）",
    "递归扫描 + 隐藏文件过滤",
    "结果列表：打开 / Finder / 失败重试",
  ],
  "atlas-pack": [
    "MaxRects 算法，支持 trim / rotate / POT / 多页",
    "4 种元数据：Cocos2d-x plist / TexturePacker JSON / CSS Sprite",
    "实时 Canvas 预览 + 利用率计算",
    "4 个预设：默认 / Cocos / Web / 兼容",
  ],
  "atlas-unpack": [
    "自动识别 4 种元数据格式",
    "还原 trim 偏移 + rotate 90°",
    "选 atlas 自动匹配同名元数据（反之亦然）",
  ],
  "atlas-incremental": [
    "merge 模式：拆开旧 atlas + 合并新散图 → 单张完整新 atlas",
    "实时预览 + 拆图缓存（参数变化无需重新拆图）",
    "差异检测：新增 / 修改 / 复用",
  ],
  "icon-gen": [
    "一张大图 → macOS .icns / Windows .ico / Web favicon / PWA 全套",
    "macOS 走 iconutil（系统自带），免装额外工具",
    "favicon 含 apple-touch-icon (180×180) 标准尺寸",
    "支持单次多目标导出",
  ],
  "image-diff": [
    "两张图像素级比对，差异处红色高亮",
    "差异指标：不同像素数 / 占比 / 最大单通道差 / 平均差",
    "自动 contain 缩放统一尺寸，差异阈值可调（消除 JPEG 噪声）",
    "调阈值时 350ms 防抖自动重算",
  ],
  "batch-rename": [
    "前缀 / 后缀 / 序号补零 / 正则替换 — 规则链式组合",
    "实时 before → after 双列预览 + 冲突检测",
    "两种模式：原地改名 / 复制到新目录改名",
    "序号支持 1~6 位补零，位置可前可后",
  ],
};

const WORKFLOWS: { title: string; steps: { tool: ToolKey; text: string }[] }[] = [
  {
    title: "首次出图集",
    steps: [
      { tool: "compress", text: "用图片压缩预处理原始素材，减小体积" },
      { tool: "atlas-pack", text: "把小图打成 atlas + 元数据，给引擎用" },
    ],
  },
  {
    title: "已有 atlas，要更新几张子图",
    steps: [
      { tool: "atlas-incremental", text: "选旧 atlas + 想加/改的散图 → 直接产新 atlas" },
    ],
  },
  {
    title: "需要从图集还原单图",
    steps: [
      { tool: "atlas-unpack", text: "选 atlas + 元数据 → 拆出全部子图" },
    ],
  },
  {
    title: "验证压缩 / 处理前后的差异",
    steps: [
      { tool: "image-diff", text: "选两张图 → 像素级 diff + 差异指标，看压缩损失或还原一致性" },
    ],
  },
  {
    title: "整理外包/多来源素材",
    steps: [
      { tool: "batch-rename", text: "先用规则统一文件名（前缀+序号+正则替换）" },
      { tool: "compress", text: "再压缩到目标体积或质量" },
      { tool: "atlas-pack", text: "需要的话最后打包成 atlas" },
    ],
  },
  {
    title: "生成应用图标",
    steps: [
      { tool: "icon-gen", text: "一张大图 → macOS .icns / Windows .ico / Web favicon / PWA 全套" },
    ],
  },
];

const APP_VERSION = "0.1.0";
const GITHUB_URL = "https://github.com/fengzhouxuan/simpleTools";

export function HomeView() {
  const { setCurrentTool } = useNavigation();

  const openLink = (url: string) => {
    void window.simpleImage.core.fs.openExternal(url);
  };

  return (
    <section class="tool-home">
      <div class="tool-home-hero">
        <strong>SimpleImageCompress · 工具集合</strong>
        <p>
          本地离线的图像资产工作台。压缩、图集打包、图集拆分、增量更新四件套，
          无需联网、无需付费，处理完即走。
        </p>
      </div>

      <div class="tool-card-grid">
        {homeToolOrder.map((tool) => {
          const meta = toolMeta[tool];
          const caps = TOOL_CAPABILITIES[tool] ?? [];
          const isAvailable = meta.status === "available";
          return (
            <article key={tool} class={`tool-card ${isAvailable ? "is-available" : ""}`}>
              <div class="tool-card-head">
                <strong>{meta.label}</strong>
                <em>{isAvailable ? "已可用" : "规划中"}</em>
              </div>
              <p>{meta.description}</p>
              {caps.length > 0 && (
                <ul class="tool-card-caps">
                  {caps.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              <button
                class="tool-card-action"
                disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) setCurrentTool(tool);
                }}
              >
                {isAvailable ? "进入工具" : "暂未开放"}
              </button>
            </article>
          );
        })}
      </div>

      <div class="tool-roadmap">
        <strong>推荐工作流</strong>
        <div class="workflow-list">
          {WORKFLOWS.map((wf) => (
            <div key={wf.title} class="workflow-item">
              <span class="workflow-title">{wf.title}</span>
              <ol class="workflow-steps">
                {wf.steps.map((s, idx) => (
                  <li key={idx}>
                    <button
                      class="workflow-link"
                      onClick={() => setCurrentTool(s.tool)}
                    >
                      {toolMeta[s.tool].label}
                    </button>
                    <span>— {s.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      <div class="tool-footer">
        <span>SimpleImageCompress v{APP_VERSION}</span>
        <span class="tool-footer-sep">·</span>
        <span>MIT 协议</span>
        <span class="tool-footer-sep">·</span>
        <button class="tool-footer-link" onClick={() => openLink(GITHUB_URL)}>
          GitHub
        </button>
      </div>
    </section>
  );
}
