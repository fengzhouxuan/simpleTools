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
    status: "planned",
    description: "针对变更资源的增量图集更新能力。",
  },
  "atlas-unpack": {
    label: "图集拆分",
    status: "planned",
    description: "将现有图集恢复为单图资源。",
  },
};

export const navToolOrder: ToolKey[] = [
  "home",
  "compress",
  "atlas-pack",
  "atlas-incremental",
  "atlas-unpack",
];

export const homeToolOrder: ToolKey[] = [
  "compress",
  "atlas-pack",
  "atlas-incremental",
  "atlas-unpack",
];
