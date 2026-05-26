export type ToolKey =
  | "home"
  | "compress"
  | "atlas-pack"
  | "atlas-incremental"
  | "atlas-unpack";

export type ToolStatus = "available" | "planned" | "workspace";

export type InputFile = {
  id: string;
  name: string;
  path: string;
  ext: string;
  size: number;
  supported: boolean;
};

export type CompressionMode = "quality" | "target-size";
export type OutputFormat = "original" | "jpg" | "png" | "webp";
export type ResizeMode = "stretch" | "crop";
export type SaveMode = "source" | "overwrite-source" | "custom";
export type PresetKey = "web" | "social" | "archive" | "minimal" | "custom";

export type CompressionResult = InputFile & {
  outputPath?: string;
  outputSize?: number;
  ratio?: number;
  status: "done" | "failed";
  error?: string;
};

export type CompressPayload = {
  files: InputFile[];
  outputDir: string;
  quality: number;
  mode: CompressionMode;
  targetSizeKB: number;
  outputFormat: OutputFormat;
  saveMode: SaveMode;
  resizeOptions: {
    width?: number;
    height?: number;
    preserveAspect: boolean;
    resizeMode: ResizeMode;
  };
};

// ===== atlas-pack =====

export type AtlasMetadataFormat = "plist" | "json-hash" | "json-array" | "css";

export type AtlasInput = {
  path: string;
  name: string;        // 写入元数据用的 frame 名（默认 basename）
};

export type AtlasPackOptions = {
  inputs: AtlasInput[];
  maxWidth: number;    // 单页最大宽，默认 2048
  maxHeight: number;   // 单页最大高，默认 2048
  padding: number;     // 子图间距，默认 2
  allowRotate: boolean;
  pot: boolean;        // 输出尺寸是否强制 2 的幂
  trim: boolean;       // 是否去 alpha 边
};

export type AtlasFrame = {
  name: string;
  sourcePath: string;
  x: number;
  y: number;
  width: number;       // 实际占位宽（trim 后，可能旋转）
  height: number;
  rotated: boolean;
  // trim 信息：原图尺寸与子图在原图中的偏移
  sourceWidth: number;
  sourceHeight: number;
  trimX: number;
  trimY: number;
  trimmed: boolean;
};

export type AtlasPage = {
  index: number;
  width: number;
  height: number;
  frames: AtlasFrame[];
  utilization: number; // 0~1
};

export type AtlasPackResult = {
  pages: AtlasPage[];
  totalUtilization: number;
};

export type AtlasExportPayload = AtlasPackOptions & {
  outputDir: string;
  outputName: string;          // 文件名前缀，如 "atlas"
  format: AtlasMetadataFormat;
};

export type AtlasExportResult = {
  pageImagePaths: string[];    // 写入的 PNG 路径
  metadataPaths: string[];     // 写入的元数据路径
};

// ===== atlas-unpack =====

// 元数据解析后的统一 frame 表示（无论源是 plist / json / css）
export type ParsedAtlasFrame = {
  name: string;          // 子图文件名（含扩展名，如 hero.png）
  x: number;             // 在 atlas 中的位置
  y: number;
  width: number;         // 在 atlas 中的占位尺寸（rotated 时为旋转后尺寸）
  height: number;
  rotated: boolean;
  trimmed: boolean;
  sourceWidth: number;   // 原图尺寸（trim 前）；无 trim 信息时等于 width/height
  sourceHeight: number;
  trimX: number;         // 内容在原图中的偏移
  trimY: number;
};

export type AtlasInspectResult = {
  atlasWidth: number;
  atlasHeight: number;
  frames: ParsedAtlasFrame[];
  detectedFormat: AtlasMetadataFormat;
};

export type AtlasUnpackPayload = {
  atlasPath: string;
  metadataPath: string;
  outputDir: string;
  restoreOriginalSize: boolean;  // true：把 trim 过的子图扩回 sourceSize 填透明；false：只输出 trim 后的可见区
};

export type AtlasUnpackResult = {
  outputPaths: string[];
  skipped: { name: string; reason: string }[];
};
