import type {
  CompressionMode,
  OutputFormat,
  PresetKey,
  ResizeMode,
} from "../../shared/types";

// 预设只控制压缩参数本身，不动 saveMode / outputDir / files 等会话态
export type PresetParams = {
  mode: CompressionMode;
  quality: number;
  targetSizeKB: number;
  outputFormat: OutputFormat;
  resizeWidth: string;
  resizeHeight: string;
  preserveAspect: boolean;
  resizeMode: ResizeMode;
};

export type Preset = {
  key: Exclude<PresetKey, "custom">;
  label: string;
  description: string;
  params: PresetParams;
};

export const presets: Preset[] = [
  {
    key: "web",
    label: "网页配图",
    description: "WebP 1920px 宽，质量 75，平衡画质与体积",
    params: {
      mode: "quality",
      quality: 75,
      targetSizeKB: 300,
      outputFormat: "webp",
      resizeWidth: "1920",
      resizeHeight: "",
      preserveAspect: true,
      resizeMode: "crop",
    },
  },
  {
    key: "social",
    label: "社交分享",
    description: "JPG 1200px 宽，质量 85，移动端友好",
    params: {
      mode: "quality",
      quality: 85,
      targetSizeKB: 300,
      outputFormat: "jpg",
      resizeWidth: "1200",
      resizeHeight: "",
      preserveAspect: true,
      resizeMode: "crop",
    },
  },
  {
    key: "archive",
    label: "归档高质量",
    description: "保持原格式，质量 92，不缩放",
    params: {
      mode: "quality",
      quality: 92,
      targetSizeKB: 300,
      outputFormat: "original",
      resizeWidth: "",
      resizeHeight: "",
      preserveAspect: true,
      resizeMode: "crop",
    },
  },
  {
    key: "minimal",
    label: "最小体积",
    description: "目标体积 200KB，原格式",
    params: {
      mode: "target-size",
      quality: 60,
      targetSizeKB: 200,
      outputFormat: "original",
      resizeWidth: "",
      resizeHeight: "",
      preserveAspect: true,
      resizeMode: "crop",
    },
  },
];

export const presetMap = new Map(presets.map((p) => [p.key, p]));

// patch 中包含这些字段时，preset 应自动切到 "custom"
export const PRESET_SENSITIVE_KEYS: ReadonlyArray<keyof PresetParams> = [
  "mode",
  "quality",
  "targetSizeKB",
  "outputFormat",
  "resizeWidth",
  "resizeHeight",
  "preserveAspect",
  "resizeMode",
];
