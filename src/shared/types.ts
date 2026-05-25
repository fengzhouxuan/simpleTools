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
