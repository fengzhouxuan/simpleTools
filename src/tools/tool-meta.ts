import type { ToolKey, ToolStatus } from "../shared/types";

export type ToolMeta = {
  label: string;
  status: ToolStatus;
  description: string;
};

export const toolMeta: Record<ToolKey, ToolMeta> = {
  home: {
    label: "工具首页",
    status: "workspace",
    description: "查看所有图像资产工具与当前阶段规划。",
  },
  compress: {
    label: "图片压缩",
    status: "available",
    description: "当前主功能，替代图压核心流程。",
  },
  "atlas-pack": {
    label: "图集打包",
    status: "available",
    description: "MaxRects 算法打包小图，输出 plist / JSON / CSS 元数据。",
  },
  "atlas-incremental": {
    label: "增量打包",
    status: "available",
    description: "基于旧 manifest 检测差异，未变子图保留原坐标，附加页装新增/修改。",
  },
  "atlas-unpack": {
    label: "图集拆分",
    status: "available",
    description: "解析 plist / JSON / CSS 元数据，把图集还原为单图。",
  },
  "icon-gen": {
    label: "图标生成",
    status: "available",
    description: "一张大图 → macOS / Windows / Web / PWA 全套图标。",
  },
  "image-diff": {
    label: "图片对比",
    status: "available",
    description: "两张图像素级比对，输出 diff 可视化与差异指标。",
  },
  "batch-rename": {
    label: "批量重命名",
    status: "available",
    description: "前缀 / 后缀 / 序号 / 正则替换 链式组合，before→after 实时预览。",
  },
  "metadata-strip": {
    label: "元数据剥离",
    status: "available",
    description: "批量去除 EXIF / GPS / IPTC / XMP 等隐私信息，可选保留色彩与方向。",
  },
  "nine-slice-crop": {
    label: "九宫格裁切",
    status: "available",
    description: "大图按 9-slice 切分 → 裁掉中间冗余 → 输出最小代表小图 + 元数据。",
  },
};

export const navToolOrder: ToolKey[] = [
  "home",
  "compress",
  "atlas-pack",
  "atlas-incremental",
  "atlas-unpack",
  "icon-gen",
  "image-diff",
  "batch-rename",
  "metadata-strip",
  "nine-slice-crop",
];

export const homeToolOrder: ToolKey[] = [
  "compress",
  "atlas-pack",
  "atlas-incremental",
  "atlas-unpack",
  "icon-gen",
  "image-diff",
  "batch-rename",
  "metadata-strip",
  "nine-slice-crop",
];
