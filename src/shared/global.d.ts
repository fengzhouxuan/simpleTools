import type {
  AtlasExportPayload,
  AtlasExportResult,
  AtlasPackOptions,
  AtlasPackResult,
  CompressPayload,
  CompressionResult,
  InputFile,
} from "./types";

declare global {
  interface Window {
    simpleImage: {
      core: {
        fs: {
          pickFiles: () => Promise<InputFile[]>;
          pickFolder: () => Promise<string | null>;
          scanDirectory: (dirPath: string) => Promise<InputFile[]>;
          normalizePaths: (paths: string[]) => Promise<InputFile[]>;
          openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
          revealInFolder: (filePath: string) => Promise<{ ok: true }>;
        };
        webUtils: {
          getPathForFile: (file: File) => string;
        };
      };
      tools: {
        compress: {
          run: (payload: CompressPayload) => Promise<CompressionResult[]>;
        };
        atlasPack: {
          pack: (payload: AtlasPackOptions) => Promise<AtlasPackResult>;
          export: (payload: AtlasExportPayload) => Promise<AtlasExportResult>;
        };
      };
    };
  }
}

export {};
