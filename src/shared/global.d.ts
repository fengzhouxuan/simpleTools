import type {
  AtlasExportPayload,
  AtlasExportResult,
  AtlasIncrementalDiff,
  AtlasIncrementalPayload,
  AtlasIncrementalResult,
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
          firstExisting: (paths: string[]) => Promise<string | null>;
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
        atlasIncremental: {
          inspect: (payload: {
            atlasPath: string;
            metadataPath: string;
            newSourcePaths: string[];
          }) => Promise<{
            diff: AtlasIncrementalDiff;
            manifest: { format: string; total: number };
          }>;
          export: (
            payload: AtlasIncrementalPayload,
          ) => Promise<AtlasIncrementalResult>;
        };
      };
    };
  }
}

export {};
