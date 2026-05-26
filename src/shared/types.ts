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
  manifestPath: string | null; // 顺手写出的 manifest（给后续增量用）
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

// ===== atlas-incremental =====

// 每个子图的"身份指纹"：hash 用于差异检测，atlas 字段用于增量时复用坐标
export type AtlasManifestEntry = {
  name: string;          // 子图 frame 名（与元数据中一致）
  sourcePath: string;    // 打包时使用的源图路径（绝对路径）
  hash: string;          // 源图内容 sha1
  page: number;          // 在第几页（0-based）
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  trimmed: boolean;
  sourceWidth: number;
  sourceHeight: number;
  trimX: number;
  trimY: number;
};

export type AtlasManifest = {
  version: 1;
  app: "SimpleImageCompress";
  format: AtlasMetadataFormat;
  pageImageNames: string[];   // 每页对应的 atlas 图片文件名
  entries: AtlasManifestEntry[];
};

export type AtlasIncrementalDiff = {
  added: string[];        // 新增子图的源路径
  modified: string[];     // 内容变化的子图（按 name 匹配，源路径可能不同）
  removed: string[];      // 旧 manifest 有但新源里没的 name
  unchanged: string[];    // 内容相同的 name
};

// merge 模式：旧 atlas + 旧元数据 + 新散图 → 拆 → 合 → 全量重打
export type AtlasIncrementalPayload = {
  atlasPath: string;
  metadataPath: string;
  newSourcePaths: string[]; // 要新增/修改的散图（不要求完整集合）
  outputDir: string;
  outputName: string;
  format: AtlasMetadataFormat;
  // 全量重打参数
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotate: boolean;
  pot: boolean;
  trim: boolean;
};

export type AtlasIncrementalInspectPayload = {
  atlasPath: string;
  metadataPath: string;
  newSourcePaths: string[];
};

export type AtlasIncrementalResult = {
  diff: AtlasIncrementalDiff;
  patchImagePath: string | null;   // merge 模式恒为 null（保留字段做未来扩展）
  pageImagePaths: string[];        // 新生成的 atlas 页（一张或多张）
  metadataPaths: string[];
  manifestPath: string | null;     // atlas-pack 顺手写出的新 manifest
  fellBackToFullRepack: boolean;   // merge 模式恒为 false（保留字段做未来扩展）
};
