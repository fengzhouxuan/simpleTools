import type { AtlasMetadataFormat } from "../../shared/types";

export type AtlasPresetKey =
  | "default"
  | "cocos2d"
  | "web-compact"
  | "compatible"
  | "custom";

export type AtlasPresetParams = {
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotate: boolean;
  pot: boolean;
  trim: boolean;
  format: AtlasMetadataFormat;
};

export type AtlasPreset = {
  key: Exclude<AtlasPresetKey, "custom">;
  label: string;
  description: string;
  params: AtlasPresetParams;
};

export const atlasPresets: AtlasPreset[] = [
  {
    key: "default",
    label: "默认",
    description: "通用 2048 + TexturePacker JSON，适合大多数场景",
    params: {
      maxWidth: 2048,
      maxHeight: 2048,
      padding: 2,
      allowRotate: false,
      pot: false,
      trim: true,
      format: "json-hash",
    },
  },
  {
    key: "cocos2d",
    label: "Cocos2d-x",
    description: "POT 2048 + plist + padding 2，给 Cocos 引擎用",
    params: {
      maxWidth: 2048,
      maxHeight: 2048,
      padding: 2,
      allowRotate: false,
      pot: true,
      trim: true,
      format: "plist",
    },
  },
  {
    key: "web-compact",
    label: "Web 紧凑",
    description: "1024 + JSON + padding 1，适合 Web sprite 节省空间",
    params: {
      maxWidth: 1024,
      maxHeight: 1024,
      padding: 1,
      allowRotate: false,
      pot: false,
      trim: true,
      format: "json-hash",
    },
  },
  {
    key: "compatible",
    label: "TexturePacker 兼容",
    description: "2048 + rotate + JSON Array，对接 TexturePacker 生态",
    params: {
      maxWidth: 2048,
      maxHeight: 2048,
      padding: 2,
      allowRotate: true,
      pot: false,
      trim: true,
      format: "json-array",
    },
  },
];

export const atlasPresetMap = new Map(atlasPresets.map((p) => [p.key, p]));

// patch 中包含这些字段时，preset 自动切到 "custom"
export const ATLAS_PRESET_SENSITIVE_KEYS: ReadonlyArray<keyof AtlasPresetParams> = [
  "maxWidth",
  "maxHeight",
  "padding",
  "allowRotate",
  "pot",
  "trim",
  "format",
];
