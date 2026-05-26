import type {
  AtlasExportPayload,
  AtlasExportResult,
  AtlasInspectResult,
  AtlasPackOptions,
  AtlasPackResult,
  AtlasUnpackPayload,
  AtlasUnpackResult,
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
          pickSingleFile: (
            filters?: { name: string; extensions: string[] }[],
          ) => Promise<string | null>;
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
        atlasUnpack: {
          inspect: (payload: {
            atlasPath: string;
            metadataPath: string;
          }) => Promise<AtlasInspectResult>;
          export: (payload: AtlasUnpackPayload) => Promise<AtlasUnpackResult>;
        };
      };
    };
  }
}

export {};
