import type { CompressionResult, InputFile } from "./types";

export const formatSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

export const formatRatio = (ratio?: number): string => {
  if (typeof ratio !== "number") return "-";
  return `${(ratio * 100).toFixed(1)}%`;
};

export const formatPath = (value: string): string => {
  if (value.length <= 72) {
    return value;
  }
  return `${value.slice(0, 28)}…${value.slice(-36)}`;
};

export const sumBy = <T>(items: T[], pick: (item: T) => number): number => {
  return items.reduce((total, item) => total + pick(item), 0);
};

export const getDisplayPath = (file: InputFile | CompressionResult): string => {
  return "outputPath" in file && file.outputPath ? file.outputPath : file.path;
};

export const getDisplaySize = (file: InputFile | CompressionResult): number => {
  return "outputSize" in file && typeof file.outputSize === "number"
    ? file.outputSize
    : file.size;
};

export const getOriginalSize = (file: InputFile | CompressionResult): number => {
  return file.size;
};
